import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { booking } = await req.json();

    if (!booking) {
      return Response.json({ error: 'Booking data is required' }, { status: 400 });
    }

    const adminEmail = 'BradCBurke@arrivestatemedia.com';
    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;

    // Create booking in database
    const createdBooking = await base44.asServiceRole.entities.Booking.create({
      ...booking,
      status: 'pending'
    });

    // Send admin notification email via Gmail
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      const emailSubject = `New Booking Request - ${booking.client_name}`;
      const payAtClosingNote = booking.request_pay_at_closing ? '\n\n⚠️ CLIENT REQUESTED PAY-AT-CLOSING' : '';
      const emailBody = `New Booking Request\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\nTotal Price: $${booking.total_price}\nNotes: ${booking.notes || 'None'}${payAtClosingNote}\n\nView and manage this booking in your admin dashboard.`;

      const messageLines = [
        `To: ${adminEmail}`,
        `From: ${adminEmail}`,
        `Subject: ${emailSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        emailBody
      ];
      const messageBytes = messageLines.map(l => new TextEncoder().encode(l + '\r\n')).reduce((acc, part) => {
        const merged = new Uint8Array(acc.length + part.length);
        merged.set(acc); merged.set(part, acc.length);
        return merged;
      }, new Uint8Array());
      const base64urlMessage = btoa(String.fromCharCode(...messageBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: base64urlMessage })
      });

      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email', recipient_type: 'admin', recipient_email: adminEmail,
        message_content: emailBody, subject: emailSubject,
        status: response.ok ? 'success' : 'failed'
      });
    } catch (error) {
      console.error('Admin email error:', error);
    }

    // For pay-up-front: generate PDF invoice and send via Brevo
    if (!booking.request_pay_at_closing) {
      try {
        const totalAmount = parseFloat(booking.total_price);

        // Invoice number
        const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1);
        const lastNumber = allInvoices.length > 0 && allInvoices[0].invoice_number
          ? parseInt(allInvoices[0].invoice_number) : 1000;
        const invoiceNumber = String(lastNumber + 1);

        // Stripe payment link
        const stripeResponse = await fetch('https://api.stripe.com/v1/payment_links', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][product_data][name]': `Media Services - ${booking.street_address}`,
            'line_items[0][price_data][unit_amount]': String(Math.round(totalAmount * 100)),
            'line_items[0][quantity]': '1',
          }),
        });
        const stripeData = await stripeResponse.json();
        if (!stripeResponse.ok) throw new Error(`Stripe error: ${stripeData.error?.message}`);

        const packagePrices = { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 };
        const packageNames = { mls_walkthrough: 'MLS Walkthrough', photo_essentials: 'Photo Essentials', photo_cinematic: 'Photo + Cinematic Walkthrough', premium_bundle: 'Premium Media Bundle' };
        const addonDescriptions = { drone: 'Drone Photography', '3d_tour': '3D Virtual Tour', twilight: 'Twilight Photography', rush_delivery: 'Rush Delivery', vertical_reel: 'Vertical Reel', ai_staging: 'AI Staging' };

        const basePkgAmount = packagePrices[booking.package] || 0;
        const addOns = booking.add_ons || [];

        // Build services line
        const servicesLine = addOns.length > 0
          ? `${packageNames[booking.package] || booking.package}, ${addOns.map(a => addonDescriptions[a] || a).join(', ')}`
          : (packageNames[booking.package] || booking.package);

        const nextInvoiceNumber = String(parseInt(invoiceNumber) + 1);
        const invoiceDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // Fetch the DOCX template from storage
        console.log('Fetching DOCX template...');
        const templateUrl = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/20161a1d0_Arriv_Estate_Media_Pay_Up_Front_Invoice.docx';
        const templateRes = await fetch(templateUrl);
        if (!templateRes.ok) throw new Error('Failed to fetch invoice template');
        const templateBytes = new Uint8Array(await templateRes.arrayBuffer());

        // Parse DOCX (it's a ZIP), replace placeholders in word/document.xml
        const { fflate } = await import('npm:fflate@0.8.2');

        const zipData = await new Promise((resolve, reject) => {
          fflate.unzip(templateBytes, (err, data) => err ? reject(err) : resolve(data));
        });

        const decoder = new TextDecoder('utf-8');
        const encoder = new TextEncoder();

        let xmlContent = decoder.decode(zipData['word/document.xml']);

        // DOCX XML often splits placeholder text across multiple <w:t> tags.
        // Reconstruct full run text before replacing, by collapsing split runs.
        // Strategy: strip XML tags temporarily for placeholder detection, then replace in raw XML.
        // Instead: do a regex that matches the placeholder even if split by XML tags.
        function xmlSafeReplace(xml, placeholder, value) {
          // Escape the placeholder chars into a pattern that allows XML tags between each char
          const escapedChars = placeholder.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          const pattern = escapedChars.join('(?:<[^>]*>)*');
          const regex = new RegExp(pattern, 'g');
          // Find all matches and replace them by rebuilding the text node
          return xml.replace(regex, (match) => {
            // Keep the XML tags from the match but replace all text content with value
            // Replace all w:t content with the value in the first w:t, clear the rest
            let first = true;
            return match.replace(/(<w:t[^>]*>)[^<]*(<\/w:t>)/g, (m, open, close) => {
              if (first) { first = false; return `${open}${value}${close}`; }
              return `${open}${close}`;
            });
          });
        }

        // Escape XML special chars in values
        function escapeXml(str) {
          return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
        }

        xmlContent = xmlSafeReplace(xmlContent, '{{JOB_ADDRESS}}', escapeXml(propertyAddress));
        xmlContent = xmlSafeReplace(xmlContent, '{{PROPERTY_ADDRESS}}', escapeXml(propertyAddress));
        xmlContent = xmlSafeReplace(xmlContent, '{{CLIENT_NAME}}', escapeXml(booking.client_name));
        xmlContent = xmlSafeReplace(xmlContent, '{{INVOICE_NUMBER}}', escapeXml(invoiceNumber));
        xmlContent = xmlSafeReplace(xmlContent, '{{AMOUNT_DUE}}', escapeXml(`$${totalAmount.toFixed(2)}`));
        xmlContent = xmlSafeReplace(xmlContent, '{{SERVICE_AND_ADD-ONS_CHOSEN}}', escapeXml(servicesLine));
        xmlContent = xmlSafeReplace(xmlContent, '{{AMOUNT_OF_PACKAGE}}', escapeXml(`$${basePkgAmount.toFixed(2)}`));
        xmlContent = xmlSafeReplace(xmlContent, '{{TOTAL_AMOUNT_OF_PACKAGE_AND_ADD-ONS}}', escapeXml(`$${totalAmount.toFixed(2)}`));
        xmlContent = xmlSafeReplace(xmlContent, '{{NEXT_INVOICE_NUMBER}}', escapeXml(nextInvoiceNumber));
        xmlContent = xmlSafeReplace(xmlContent, '{{DATE_OF_INVOICE_CREATION}}', escapeXml(invoiceDate));
        xmlContent = xmlSafeReplace(xmlContent, '{{DATE OF JOB}}', escapeXml(booking.preferred_date));

        // For the Stripe link placeholder: replace plain text with a proper hyperlink
        // First, add the relationship for the hyperlink
        const stripeUrl = stripeData.url;
        const relsFile = 'word/_rels/document.xml.rels';
        let relsContent = zipData[relsFile] ? decoder.decode(zipData[relsFile]) : '';
        const hyperlinkRelId = 'rIdStripeLink';
        const hyperlinkRel = `<Relationship Id="${hyperlinkRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${stripeUrl}" TargetMode="External"/>`;
        if (relsContent && !relsContent.includes(hyperlinkRelId)) {
          relsContent = relsContent.replace('</Relationships>', `${hyperlinkRel}</Relationships>`);
          zipData[relsFile] = encoder.encode(relsContent);
        }

        // Replace the {{PLACE_STRIP_LINK}} placeholder with a hyperlink element
        const hyperlinkXml = `<w:hyperlink r:id="${hyperlinkRelId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>${escapeXml(stripeUrl)}</w:t></w:r></w:hyperlink>`;
        xmlContent = xmlSafeReplace(xmlContent, '{{PLACE_STRIP_LINK}}', escapeXml(stripeUrl));
        // Also try direct string replace in case it didn't get split
        xmlContent = xmlContent.replace(/\{\{PLACE_STRIP_LINK\}\}/g, escapeXml(stripeUrl));

        zipData['word/document.xml'] = encoder.encode(xmlContent);

        // Re-zip the DOCX
        const updatedDocx = await new Promise((resolve, reject) => {
          fflate.zip(zipData, { level: 0 }, (err, data) => err ? reject(err) : resolve(data));
        });

        // Convert DOCX to PDF using CloudConvert API
        console.log('Converting DOCX to PDF via CloudConvert...');
        const cloudConvertApiKey = Deno.env.get('CLOUDCONVERT_API_KEY');

        // Create a job
        const jobRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${cloudConvertApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tasks: {
              'upload-file': { operation: 'import/upload' },
              'convert-file': { operation: 'convert', input: 'upload-file', output_format: 'pdf' },
              'export-file': { operation: 'export/url', input: 'convert-file' }
            }
          })
        });
        const jobData = await jobRes.json();
        if (!jobRes.ok) throw new Error(`CloudConvert job creation failed: ${JSON.stringify(jobData)}`);

        const uploadTask = jobData.data.tasks.find(t => t.name === 'upload-file');
        const uploadForm = uploadTask.result?.form;
        if (!uploadForm) throw new Error('No upload form from CloudConvert');

        // Upload DOCX to CloudConvert
        const formData = new FormData();
        for (const [k, v] of Object.entries(uploadForm.parameters)) formData.append(k, v);
        formData.append('file', new Blob([updatedDocx], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'invoice.docx');

        await fetch(uploadForm.url, { method: 'POST', body: formData });

        // Wait for job to finish
        let pdfUrl = null;
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const statusRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobData.data.id}`, {
            headers: { 'Authorization': `Bearer ${cloudConvertApiKey}` }
          });
          const statusData = await statusRes.json();
          const exportTask = statusData.data.tasks.find(t => t.name === 'export-file');
          if (exportTask?.status === 'finished') {
            pdfUrl = exportTask.result.files[0].url;
            break;
          }
          if (statusData.data.status === 'error') throw new Error('CloudConvert conversion failed');
        }
        if (!pdfUrl) throw new Error('CloudConvert timed out');

        // Download the PDF
        const pdfRes = await fetch(pdfUrl);
        const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
        console.log('PDF generated from template, size:', pdfBytes.length);

        // Upload to Google Drive
        const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
        const unpaidFolderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';
        const fileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;
        const boundary = 'boundary_arriv_invoice';
        const metadata = JSON.stringify({ name: fileName, parents: [unpaidFolderId] });
        const enc = new TextEncoder();
        const before = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
        const after = enc.encode(`\r\n--${boundary}--`);
        const uploadBody = new Uint8Array(before.length + pdfBytes.length + after.length);
        uploadBody.set(before); uploadBody.set(new Uint8Array(pdfBytes), before.length); uploadBody.set(after, before.length + pdfBytes.length);

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
          body: uploadBody
        });
        const uploadedFile = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(`Drive upload failed: ${uploadedFile.error?.message}`);

        const pdfFileId = uploadedFile.id;
        await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });
        const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
          headers: { 'Authorization': `Bearer ${driveToken}` }
        });
        const { webViewLink: driveViewLink } = await fileDetailsRes.json();
        console.log('Drive link:', driveViewLink);

        // Send invoice email via Brevo
        const brevoApiKey = Deno.env.get('BREVO_API_KEY');
        const firstName = booking.client_name.split(' ')[0];
        const htmlEmailBody = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Your invoice for media services at <strong>${propertyAddress}</strong> is ready. Please use the link below to view your invoice and submit payment at your convenience.</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${driveViewLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">👉 View Invoice</a>
  </p>
  <p>If you have any questions, feel free to reach out.</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body></html>`;

        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
            to: [{ email: booking.client_email, name: booking.client_name }],
            subject: 'Your Invoice from Arriv Estate Media',
            htmlContent: htmlEmailBody
          })
        });
        const brevoData = await brevoResponse.json();
        if (!brevoResponse.ok) throw new Error(`Brevo error: ${brevoData.message}`);
        console.log('Invoice email sent, messageId:', brevoData.messageId);

        // Save invoice record
        const invoice = await base44.asServiceRole.entities.Invoice.create({
          invoice_number: invoiceNumber,
          invoice_type: 'pay_up_front',
          booking_id: createdBooking.id,
          client_name: booking.client_name,
          client_email: booking.client_email,
          job_address: propertyAddress,
          service_date: booking.preferred_date,
          package: booking.package,
          add_ons: addOns,
          amount: totalAmount,
          payment_status: 'unpaid',
          stripe_payment_link_id: stripeData.id,
          stripe_payment_link_url: stripeData.url,
          google_drive_unpaid_url: driveViewLink,
          google_drive_file_id: pdfFileId,
          pay_at_closing: false,
          email_sent_at: new Date().toISOString()
        });

        // Log success
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client',
          recipient_email: booking.client_email,
          message_content: `Invoice #${invoiceNumber} sent for ${propertyAddress}`,
          subject: 'Your Invoice from Arriv Estate Media',
          status: 'success'
        });

        // Update booking with invoice ID
        await base44.asServiceRole.entities.Booking.update(createdBooking.id, { invoice_id: invoice.id });

      } catch (invoiceError) {
        console.error('Invoice generation error:', invoiceError);
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client',
          recipient_email: booking.client_email,
          message_content: `Failed to generate invoice for booking`,
          subject: 'Booking Confirmation - Invoice Pending',
          status: 'failed',
          error_message: invoiceError.message
        });
      }

    } else {
      // Pay-at-closing: send simple confirmation via Gmail
      try {
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
        const emailSubject = 'Your Booking Request Confirmation';
        const emailBody = `Thank you for your booking request!\n\nWe've received your request for:\n\nPackage: ${booking.package}\nProperty: ${propertyAddress}\nPreferred Date: ${booking.preferred_date}\nPreferred Time: ${booking.preferred_time}\n\nWe'll be in contact to discuss your Pay-at-closing details.\n\nThank you!`;

        const messageLines = [
          `To: ${booking.client_email}`, `From: ${adminEmail}`, `Subject: ${emailSubject}`,
          'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', '', emailBody
        ];
        const messageBytes = messageLines.map(l => new TextEncoder().encode(l + '\r\n')).reduce((acc, part) => {
          const merged = new Uint8Array(acc.length + part.length);
          merged.set(acc); merged.set(part, acc.length);
          return merged;
        }, new Uint8Array());
        const base64urlMessage = btoa(String.fromCharCode(...messageBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: base64urlMessage })
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client', recipient_email: booking.client_email,
          message_content: emailBody, subject: emailSubject,
          status: response.ok ? 'success' : 'failed'
        });
      } catch (error) {
        console.error('Pay-at-closing confirmation email error:', error);
      }

      // SMS to admin
      try {
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
        const adminPhone = Deno.env.get('ADMIN_PHONE');
        const smsMessage = `PAY-AT-CLOSING REQUESTED\n\nClient: ${booking.client_name}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nPackage: ${booking.package}\nTotal: $${booking.total_price}`;

        const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: fromPhone, To: adminPhone, Body: smsMessage }).toString(),
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'sms', recipient_type: 'admin', recipient_phone: adminPhone,
          message_content: smsMessage, status: smsResponse.ok ? 'success' : 'failed'
        });
      } catch (error) {
        console.error('Admin SMS error:', error);
      }
    }

    return Response.json({ success: true, booking: createdBooking });
  } catch (error) {
    console.error('Booking submission error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});