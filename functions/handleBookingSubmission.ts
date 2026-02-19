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
        console.log('Template fetched, size:', templateBytes.length);

        // Use docxtemplater for proper DOCX templating (handles split XML runs)
        const PizZip = (await import('npm:pizzip@3.1.7')).default;
        const Docxtemplater = (await import('npm:docxtemplater@3.56.0')).default;
        console.log('Docxtemplater imported successfully');

        const stripeUrl = stripeData.url;
        console.log('Stripe URL:', stripeUrl);

        const zip = new PizZip(templateBytes);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: '{{', end: '}}' }
        });
        console.log('Docxtemplater instance created');

        doc.render({
          JOB_ADDRESS: propertyAddress,
          PROPERTY_ADDRESS: propertyAddress,
          CLIENT_NAME: booking.client_name,
          INVOICE_NUMBER: invoiceNumber,
          AMOUNT_DUE: `$${totalAmount.toFixed(2)}`,
          'SERVICE_AND_ADD-ONS_CHOSEN': servicesLine,
          AMOUNT_OF_PACKAGE: `$${basePkgAmount.toFixed(2)}`,
          'TOTAL_AMOUNT_OF_PACKAGE_AND_ADD-ONS': `$${totalAmount.toFixed(2)}`,
          PLACE_STRIP_LINK: stripeUrl,
          NEXT_INVOICE_NUMBER: nextInvoiceNumber,
          DATE_OF_INVOICE_CREATION: invoiceDate,
          'DATE OF JOB': booking.preferred_date,
        });
        console.log('Template rendered successfully');

        const updatedDocx = doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
        console.log('DOCX generated, size:', updatedDocx.length);

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
        console.log('Google Drive upload response status:', uploadRes.status);
        const uploadedDoc = await uploadRes.json();
        if (!uploadRes.ok) {
          console.error('Drive upload error:', uploadedDoc);
          throw new Error(`Drive upload failed: ${JSON.stringify(uploadedDoc.error)}`);
        }
        console.log('Uploaded Google Doc ID:', uploadedDoc.id);

        // Export the Google Doc as PDF
        console.log('Exporting as PDF...');
        let pdfBytes;
        try {
          const pdfExportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadedDoc.id}/export?mimeType=application/pdf`, {
            headers: { 'Authorization': `Bearer ${driveToken}` }
          });
          if (!pdfExportRes.ok) {
            const errorText = await pdfExportRes.text();
            console.error('PDF export failed:', pdfExportRes.status, errorText);
            throw new Error(`PDF export failed: ${pdfExportRes.status} ${errorText}`);
          }
          pdfBytes = new Uint8Array(await pdfExportRes.arrayBuffer());
          console.log('PDF exported successfully, size:', pdfBytes.length);
          if (!pdfBytes || pdfBytes.length === 0) {
            throw new Error('PDF export returned empty buffer');
          }
        } catch (error) {
          console.error('PDF export error:', error.message);
          throw error;
        }

        // Add clickable Stripe link to PDF
        console.log('Adding Stripe payment link to PDF...');
        try {
          const { PDFDocument, rgb } = await import('npm:pdf-lib@1.17.1');
          const pdfDoc = await PDFDocument.load(pdfBytes);
          const pages = pdfDoc.getPages();
          if (pages.length === 0) {
            console.warn('PDF has no pages, skipping link addition');
          } else {
            const lastPage = pages[pages.length - 1];
            const { height, width } = lastPage.getSize();
            
            const linkX = 50;
            const linkY = height - 80;
            const linkWidth = 100;
            const linkHeight = 24;
            
            // Draw visible text
            lastPage.drawText('Pay Now', {
              x: linkX,
              y: linkY,
              size: 14,
              color: rgb(0.72, 0.59, 0.42), // Gold color (#B8956A)
            });
            
            // Add link annotation
            lastPage.drawRectangle({
              x: linkX,
              y: linkY - linkHeight,
              width: linkWidth,
              height: linkHeight,
              borderColor: rgb(0.72, 0.59, 0.42),
              borderWidth: 1,
              link: stripeUrl,
            });
            
            console.log('Stripe link added to PDF at', linkX, linkY);
          }
          
          const modifiedPdfBytes = await pdfDoc.save();
          pdfBytes = new Uint8Array(modifiedPdfBytes);
          console.log('PDF saved with link, new size:', pdfBytes.length);
        } catch (pdfError) {
          console.error('Error adding link to PDF:', pdfError.message);
          // Continue with PDF even if link addition fails
        }

        // Delete the temporary Google Doc
        console.log('Deleting temporary Google Doc:', uploadedDoc.id);
        try {
          const deleteRes = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadedDoc.id}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${driveToken}` }
          });
          if (deleteRes.ok) {
            console.log('Temporary Google Doc deleted');
          } else {
            console.warn('Failed to delete temporary Google Doc, continuing anyway');
          }
        } catch (error) {
          console.warn('Error deleting temporary doc:', error.message);
        }

        // Upload the final PDF to the UNPAID folder
        console.log('Starting PDF upload to UNPAID folder, PDF size:', pdfBytes.length, 'bytes');
        let uploadedPdf;
        try {
          const pdfFileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;
          console.log('PDF filename:', pdfFileName);
          
          const pdfMetadata = JSON.stringify({ name: pdfFileName, parents: [unpaidFolderId], mimeType: 'application/pdf' });
          const pdfBefore = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${pdfMetadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`);
          const pdfAfter = enc.encode(`\r\n--${boundary}--`);
          const pdfUploadBody = new Uint8Array(pdfBefore.length + pdfBytes.length + pdfAfter.length);
          pdfUploadBody.set(pdfBefore);
          pdfUploadBody.set(pdfBytes, pdfBefore.length);
          pdfUploadBody.set(pdfAfter, pdfBefore.length + pdfBytes.length);
          console.log('PDF multipart body assembled, total size:', pdfUploadBody.length);
  
          const pdfUploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
            body: pdfUploadBody
          });
          console.log('PDF upload response status:', pdfUploadRes.status);
          
          uploadedPdf = await pdfUploadRes.json();
          console.log('PDF upload response:', JSON.stringify(uploadedPdf).substring(0, 200));
          
          if (!pdfUploadRes.ok) {
            console.error('PDF upload failed, response:', uploadedPdf);
            throw new Error(`PDF upload failed: ${pdfUploadRes.status} ${JSON.stringify(uploadedPdf.error)}`);
          }
          if (!uploadedPdf.id) {
            console.error('PDF upload succeeded but no file ID returned:', uploadedPdf);
            throw new Error('PDF uploaded but no file ID returned');
          }
          console.log('PDF uploaded successfully:', uploadedPdf.id);
        } catch (error) {
          console.error('PDF upload error:', error.message);
          throw error;
        }

        const pdfFileId = uploadedPdf.id;
        console.log('Setting PDF permissions to public...');
        try {
          const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          });
          if (!permRes.ok) {
            console.warn('Warning: Failed to set public permissions, continuing anyway');
          } else {
            console.log('PDF permissions set to public');
          }
        } catch (error) {
          console.warn('Warning: Error setting permissions:', error.message);
        }

        console.log('Getting PDF share link...');
        let driveViewLink;
        try {
          const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
            headers: { 'Authorization': `Bearer ${driveToken}` }
          });
          if (!fileDetailsRes.ok) {
            throw new Error(`Failed to get file details: ${fileDetailsRes.status}`);
          }
          const fileDetails = await fileDetailsRes.json();
          driveViewLink = fileDetails.webViewLink;
          console.log('Drive PDF link:', driveViewLink);
          if (!driveViewLink) {
            throw new Error('No webViewLink returned from Google Drive');
          }
        } catch (error) {
          console.error('Error getting PDF link:', error.message);
          throw error;
        }

        // Send invoice email via Brevo
        console.log('Preparing Brevo email...');
        const brevoApiKey = Deno.env.get('BREVO_API_KEY');
        if (!brevoApiKey) {
          throw new Error('BREVO_API_KEY not set');
        }
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

        console.log('Sending invoice email via Brevo to:', booking.client_email);
        let brevoResponse;
        let brevoData;
        try {
          brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
              to: [{ email: booking.client_email, name: booking.client_name }],
              subject: 'Your Invoice from Arriv Estate Media',
              htmlContent: htmlEmailBody
            })
          });
          console.log('Brevo response status:', brevoResponse.status);
          
          brevoData = await brevoResponse.json();
          console.log('Brevo response:', JSON.stringify(brevoData).substring(0, 200));
          
          if (!brevoResponse.ok) {
            console.error('Brevo API error:', brevoData);
            throw new Error(`Brevo error: ${brevoResponse.status} ${brevoData.message || JSON.stringify(brevoData)}`);
          }
          console.log('Invoice email sent successfully, messageId:', brevoData.messageId);
        } catch (error) {
          console.error('Brevo email error:', error.message);
          throw error;
        }

        // Save invoice record with all data
        console.log('Creating invoice record...');
        let invoice;
        try {
          invoice = await base44.asServiceRole.entities.Invoice.create({
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
          console.log('Invoice created successfully:', invoice.id);
        } catch (error) {
          console.error('Error creating invoice record:', error.message);
          throw error;
        }

        // Log success
        console.log('Logging message success...');
        try {
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email', recipient_type: 'client',
            recipient_email: booking.client_email,
            message_content: `Invoice #${invoiceNumber} sent for ${propertyAddress}`,
            subject: 'Your Invoice from Arriv Estate Media',
            status: 'success'
          });
          console.log('Message log created');
        } catch (error) {
          console.error('Error logging message:', error.message);
        }

        // Update booking with invoice ID
        console.log('Updating booking with invoice ID...');
        try {
          await base44.asServiceRole.entities.Booking.update(createdBooking.id, { invoice_id: invoice.id });
          console.log('Booking updated with invoice ID');
        } catch (error) {
          console.error('Error updating booking:', error.message);
        }

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