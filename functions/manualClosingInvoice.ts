import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { bookingId, closingDate, finalSalePrice } = await req.json();

    if (!bookingId || !closingDate) {
      return Response.json({ error: 'bookingId and closingDate are required' }, { status: 400 });
    }

    // Get the booking
    const bookings = await base44.asServiceRole.entities.Booking.filter({ id: bookingId });
    const booking = bookings[0];
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Get the job from booking
    const jobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    const job = jobs[0];
    if (!job) {
      return Response.json({ error: 'No job found for this booking' }, { status: 404 });
    }

    // Update ClosingDetection
    let detection = (await base44.asServiceRole.entities.ClosingDetection.filter({ job_id: job.id }))[0];
    if (!detection) {
      detection = await base44.asServiceRole.entities.ClosingDetection.create({
        job_id: job.id,
        job_address: job.location || booking.street_address,
        monitoring_start_date: job.date,
        status: 'manual_closed',
        closing_date: closingDate,
        final_sale_price: finalSalePrice || null,
        closed_detected_at: new Date().toISOString(),
        detection_source: 'manual'
      });
    } else {
      await base44.asServiceRole.entities.ClosingDetection.update(detection.id, {
        status: 'manual_closed',
        closing_date: closingDate,
        final_sale_price: finalSalePrice || null,
        closed_detected_at: new Date().toISOString(),
        detection_source: 'manual'
      });
    }

    // Generate final closing invoice (calls Brevo internally)
    const invoiceResult = await base44.asServiceRole.functions.invoke('generateFinalClosingInvoice', {
      bookingId,
      closingDate,
      finalSalePrice
    });

    // Mark detection as having final invoice sent
    await base44.asServiceRole.entities.ClosingDetection.update(detection.id, {
      final_invoice_sent: true
    });

    // Send confirmation email to Bradley
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'BradCBurke@arrivestatemedia.com';
    const htmlBody = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; color: #333;">
  <h2>✅ Final Closing Invoice Generated</h2>
  <p><strong>Property:</strong> ${job.location}</p>
  <p><strong>Closing Date:</strong> ${closingDate}</p>
  ${finalSalePrice ? `<p><strong>Final Sale Price:</strong> $${finalSalePrice}</p>` : ''}
  <p><strong>Invoice Generated:</strong> ${new Date().toLocaleDateString()}</p>
  <hr>
  <p>The final closing invoice has been generated and sent to the client.</p>
</body></html>`;

    const messageLines = [
      `To: ${adminEmail}`,
      `From: ${adminEmail}`,
      'Subject: Final Closing Invoice Generated',
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

    return Response.json({ success: true, invoiceId: invoiceResult.invoiceId });
  } catch (error) {
    console.error('Manual closing invoice error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});