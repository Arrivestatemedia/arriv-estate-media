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
        const templateUrl = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/a3caf273e_Arriv_Estate_Media_Pay_Up_Front_Invoice.docx';
        const templateRes = await fetch(templateUrl);
        if (!templateRes.ok) throw new Error('Failed to fetch invoice template');
        const templateBytes = new Uint8Array(await templateRes.arrayBuffer());

        // Use docxtemplater for proper DOCX templating (handles split XML runs)
        const PizZip = (await import('npm:pizzip@3.1.7')).default;
        const Docxtemplater = (await import('npm:docxtemplater@3.56.0')).default;

        const stripeUrl = stripeData.url;

        const zip = new PizZip(templateBytes);

        // Replace hyperlink target URL in the relationship file (word/_rels/document.xml.rels)
        // The template has a placeholder hyperlink target we replace with the actual Stripe URL
        const relsPath = 'word/_rels/document.xml.rels';
        if (zip.files[relsPath]) {
          let relsXml = zip.files[relsPath].asText();
          console.log('Rels file hyperlinks:', relsXml.match(/Type="[^"]*hyperlink[^"]*"[^/]*/gi));
          // Replace ALL hyperlink targets in the rels file with the Stripe URL
          // This works because the template should only have one hyperlink (the payment link)
          let replacedCount = 0;
          relsXml = relsXml.replace(
            /(<Relationship[^>]+Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/hyperlink"[^>]+Target=")([^"]*)(")/gi,
            (match, before, oldUrl, after) => {
              console.log('Replacing hyperlink URL:', oldUrl, '->', stripeUrl);
              replacedCount++;
              return `${before}${stripeUrl}${after}`;
            }
          );
          console.log(`Replaced ${replacedCount} hyperlink(s)`);
          zip.file(relsPath, relsXml);
        }

        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: '{{', end: '}}' }
        });

        doc.render({
          JOB_ADDRESS: propertyAddress,
          PROPERTY_ADDRESS: propertyAddress,
          CLIENT_NAME: booking.client_name,
          INVOICE_NUMBER: invoiceNumber,
          AMOUNT_DUE: `$${totalAmount.toFixed(2)}`,
          'SERVICE_AND_ADD-ONS_CHOSEN': servicesLine,
          AMOUNT_OF_PACKAGE: `$${basePkgAmount.toFixed(2)}`,
          'TOTAL_AMOUNT_OF_PACKAGE_AND_ADD-ONS': `$${totalAmount.toFixed(2)}`,
          NEXT_INVOICE_NUMBER: nextInvoiceNumber,
          DATE_OF_INVOICE_CREATION: invoiceDate,
          'DATE OF JOB': booking.preferred_date,
        });

        const updatedDocx = doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });

        // Upload filled DOCX to Google Drive as Google Doc (auto-converts to Google Doc format)
        console.log('Uploading filled DOCX to Google Drive...');
        const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
        const unpaidFolderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';
        const enc = new TextEncoder();
        const boundary = 'boundary_arriv_invoice';
        const docFileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}`;

        // Upload as Google Doc (Drive converts DOCX -> Google Doc)
        const docMetadata = JSON.stringify({ name: docFileName, parents: [unpaidFolderId], mimeType: 'application/vnd.google-apps.document' });
        const before = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${docMetadata}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`);
        const after = enc.encode(`\r\n--${boundary}--`);
        const uploadBody = new Uint8Array(before.length + updatedDocx.length + after.length);
        uploadBody.set(before); uploadBody.set(updatedDocx, before.length); uploadBody.set(after, before.length + updatedDocx.length);

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
          body: uploadBody
        });
        const uploadedDoc = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(`Drive upload failed: ${JSON.stringify(uploadedDoc.error)}`);
        console.log('Uploaded Google Doc ID:', uploadedDoc.id);

        // Export the Google Doc as PDF
        console.log('Exporting as PDF...');
        const pdfExportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadedDoc.id}/export?mimeType=application/pdf`, {
          headers: { 'Authorization': `Bearer ${driveToken}` }
        });
        if (!pdfExportRes.ok) throw new Error(`PDF export failed: ${await pdfExportRes.text()}`);
        const pdfBytes = new Uint8Array(await pdfExportRes.arrayBuffer());
        console.log('PDF exported, size:', pdfBytes.length);

        // Delete the temporary Google Doc
        await fetch(`https://www.googleapis.com/drive/v3/files/${uploadedDoc.id}`, {
          method: 'DELETE', headers: { 'Authorization': `Bearer ${driveToken}` }
        });

        // Upload the final PDF to the UNPAID folder
        console.log('Uploading PDF to UNPAID folder...');
        const pdfFileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;
        const pdfMetadata = JSON.stringify({ name: pdfFileName, parents: [unpaidFolderId] });
        const pdfBefore = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${pdfMetadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
        const pdfAfter = enc.encode(`\r\n--${boundary}--`);
        const pdfUploadBody = new Uint8Array(pdfBefore.length + pdfBytes.length + pdfAfter.length);
        pdfUploadBody.set(pdfBefore); pdfUploadBody.set(pdfBytes, pdfBefore.length); pdfUploadBody.set(pdfAfter, pdfBefore.length + pdfBytes.length);

        const pdfUploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
          body: pdfUploadBody
        });
        const uploadedPdf = await pdfUploadRes.json();
        if (!pdfUploadRes.ok) throw new Error(`PDF upload failed: ${JSON.stringify(uploadedPdf.error)}`);

        const pdfFileId = uploadedPdf.id;
        await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });
        const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
          headers: { 'Authorization': `Bearer ${driveToken}` }
        });
        const { webViewLink: driveViewLink } = await fileDetailsRes.json();
        console.log('Drive PDF link:', driveViewLink);

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