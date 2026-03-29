import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all jobs with dates in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];

    const jobs = await base44.asServiceRole.entities.Job.filter({ from_booking: true }, '-created_date');
    const pastJobs = jobs.filter(j => {
      if (!j.completed_at) return false;
      const completedDate = new Date(j.completed_at);
      completedDate.setHours(0, 0, 0, 0);
      const oneDayAfterCompletion = new Date(completedDate);
      oneDayAfterCompletion.setDate(oneDayAfterCompletion.getDate() + 1);
      return oneDayAfterCompletion <= today;
    });

    console.log(`Found ${pastJobs.length} past jobs to monitor for closings`);

    for (const job of pastJobs) {
      try {
        // Check if we already have a ClosingDetection record
        const existingDetections = await base44.asServiceRole.entities.ClosingDetection.filter({
          job_id: job.id
        });
        let detection = existingDetections[0];

        // Create ClosingDetection if it doesn't exist
        if (!detection) {
          detection = await base44.asServiceRole.entities.ClosingDetection.create({
            job_id: job.id,
            job_address: job.location || `${job.client_name} property`,
            monitoring_start_date: job.date,
            status: 'monitoring'
          });
          console.log(`Created new ClosingDetection for job ${job.id}`);
        }

        // Skip if already closed
        if (detection.status === 'closed' || detection.status === 'manual_closed') {
          console.log(`Job ${job.id} already marked as closed, skipping`);
          continue;
        }

        // Skip if final invoice already sent
        if (detection.final_invoice_sent) {
          console.log(`Job ${job.id} already has final invoice sent, skipping`);
          continue;
        }

        // Rate limit: only scan once per day per property
        if (detection.last_scan_at) {
          const lastScan = new Date(detection.last_scan_at);
          const hoursSinceLastScan = (today.getTime() - lastScan.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastScan < 20) {
            console.log(`Job ${job.id} scanned recently, skipping`);
            continue;
          }
        }

        console.log(`Checking if ${job.location} has sold...`);

        // Use AI to search for property closing
        const llmResponse = await base44.integrations.Core.InvokeLLM({
          prompt: `Has the property at "${job.location}" recently sold or closed? Search real estate sites like Zillow, Realtor.com, MLS databases to find the closing status. Provide the closing date if found, and the final sale price if available.`,
          add_context_from_internet: true,
          response_json_schema: {
            type: 'object',
            properties: {
              has_sold: { type: 'boolean' },
              closing_date: { type: 'string', description: 'Date in YYYY-MM-DD format if found' },
              final_sale_price: { type: 'number' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              source_info: { type: 'string' }
            }
          }
        });

        console.log('LLM response:', JSON.stringify(llmResponse));

        // Update scan timestamp
        await base44.asServiceRole.entities.ClosingDetection.update(detection.id, {
          last_scan_at: new Date().toISOString(),
          scan_notes: (detection.scan_notes || '') + `\n[${new Date().toISOString()}] Scan: ${llmResponse.confidence} confidence - ${llmResponse.source_info}`
        });

        // If closing detected — reject if closing date is older than the job's shoot date (false positive from prior sale)
        if (llmResponse.has_sold && llmResponse.closing_date && llmResponse.closing_date >= job.date) {
          console.log(`CLOSING DETECTED for job ${job.id}: ${job.location} closed on ${llmResponse.closing_date}`);

          // Update ClosingDetection
          await base44.asServiceRole.entities.ClosingDetection.update(detection.id, {
            status: 'closed',
            closed_detected_at: new Date().toISOString(),
            closing_date: llmResponse.closing_date,
            final_sale_price: llmResponse.final_sale_price || null,
            detection_source: 'ai_scan'
          });

          // Send Gmail notification to Bradley
          try {
            const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
            const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'BradCBurke@arrivestatemedia.com';
            const htmlBody = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; color: #333;">
  <h2>🏠 Property Closing Detected</h2>
  <p><strong>Property:</strong> ${job.location}</p>
  <p><strong>Job ID:</strong> ${job.id}</p>
  <p><strong>Closing Date:</strong> ${llmResponse.closing_date}</p>
  ${llmResponse.final_sale_price ? `<p><strong>Final Sale Price:</strong> $${llmResponse.final_sale_price}</p>` : ''}
  <p><strong>Confidence:</strong> ${llmResponse.confidence}</p>
  <p><strong>Source:</strong> ${llmResponse.source_info}</p>
  <hr>
  <p>A final closing invoice should be generated for this property.</p>
  <p><a href="${Deno.env.get('BASE44_APP_DOMAIN')}/admin-bookings" style="background: #B8956A; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">View in Dashboard</a></p>
</body></html>`;

            const messageLines = [
              `To: ${adminEmail}`,
              `From: ${adminEmail}`,
              'Subject: Property Closing Detected - Final Invoice Needed',
              'MIME-Version: 1.0',
              'Content-Type: text/html; charset="UTF-8"',
              '',
              htmlBody
            ];
            const messageBytes = messageLines.map(l => new TextEncoder().encode(l + '\r\n')).reduce((acc, part) => {
              const merged = new Uint8Array(acc.length + part.length);
              merged.set(acc);
              merged.set(part, acc.length);
              return merged;
            }, new Uint8Array());
            const base64urlMessage = btoa(String.fromCharCode(...messageBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

            await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ raw: base64urlMessage })
            });
            console.log('Gmail notification sent');
          } catch (e) {
            console.error('Gmail notification failed:', e.message);
          }

          // Send Twilio SMS
          try {
            const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
            const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
            const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
            const bradleyPhone = Deno.env.get('BRADLEY_PHONE');

            const smsMessage = `CLOSING DETECTED!\n\nProperty: ${job.location}\nClosing Date: ${llmResponse.closing_date}\n${llmResponse.final_sale_price ? `Sale Price: $${llmResponse.final_sale_price}\n` : ''}Generate final invoice now.`;

            await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                From: fromPhone,
                To: bradleyPhone,
                Body: smsMessage
              }).toString()
            });
            console.log('SMS notification sent');
          } catch (e) {
            console.error('SMS notification failed:', e.message);
          }
        }
      } catch (jobError) {
        console.error(`Error processing job ${job.id}:`, jobError.message);
      }
    }

    return Response.json({ success: true, jobsProcessed: pastJobs.length });
  } catch (error) {
    console.error('Closing detection error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});