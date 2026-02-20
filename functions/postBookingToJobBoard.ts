import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);

    // Contractor pricing mapping
    const contractorPackagePricing = {
      'mls_walkthrough': 60,
      'photo_essentials': 150,
      'photo_cinematic': 250,
      'premium_bundle': 325
    };

    const contractorAddonPricing = {
      'drone': 60,
      '3d_tour': 60,
      'twilight': 40,
      'vertical_reel': 25,
      'ai_staging': 0,
      'rush_delivery': 0
    };

    // Calculate contractor pay rate
    const packageRate = contractorPackagePricing[booking.package] || 0;
    let addonsTotal = 0;
    
    if (booking.add_ons && Array.isArray(booking.add_ons)) {
      addonsTotal = booking.add_ons.reduce((sum, addon) => {
        return sum + (contractorAddonPricing[addon] || 0);
      }, 0);
    }

    const contractorPayRate = packageRate + addonsTotal;

    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;

    // Check if job already exists for this booking
    const existingJobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    
    if (!existingJobs || existingJobs.length === 0) {
      await base44.asServiceRole.entities.Job.create({
        title: `Photography - ${propertyAddress}`,
        type: 'photo',
        description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
        location: propertyAddress,
        date: booking.preferred_date,
        start_time: booking.preferred_time,
        duration_hours: 2,
        pay_rate: contractorPayRate,
        client_price: booking.total_price,
        status: 'open',
        from_booking: true,
        booking_id: bookingId,
        package: booking.package,
        add_ons: booking.add_ons || [],
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone
      });
    }

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    // Send approval email and calendar invite
    try {
      // Send SMS confirmation
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      
      if (booking.client_phone && twilioPhone && accountSid && authToken) {
        const messageText = `Hi ${booking.client_name}! Your booking at ${propertyAddress} on ${booking.preferred_date} at ${booking.preferred_time} has been confirmed. You'll receive an email shortly. - Arriv`;
        await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
          },
          body: new URLSearchParams({
            'From': twilioPhone,
            'To': booking.client_phone,
            'Body': messageText,
          }).toString(),
        });
      }

      // Send email confirmation via Gmail
      const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'BradCBurke@arrivestatemedia.com';
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      
      const emailSubject = 'Your Booking Confirmation - Arriv';
      const emailBody = `Hi ${booking.client_name},\n\nYour booking has been confirmed!\n\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\n\nYou should receive a calendar invite shortly. We'll contact you if there are any changes.\n\nThank you,\nArriv Team`;
      
      const messageLines = [
        `To: ${booking.client_email}`,
        `From: ${adminEmail}`,
        `Subject: ${emailSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        emailBody
      ];

      const messageParts = messageLines.map(line => new TextEncoder().encode(line + '\r\n'));
      const messageBytes = messageParts.reduce((acc, part) => {
        const newAcc = new Uint8Array(acc.length + part.length);
        newAcc.set(acc);
        newAcc.set(part, acc.length);
        return newAcc;
      }, new Uint8Array());

      const base64urlMessage = btoa(String.fromCharCode(...messageBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64urlMessage })
      });
      
      console.log('[INFO] Sent confirmation email to', booking.client_email);
    } catch (error) {
      console.error('Failed to send notifications:', error);
    }

    // Differentiate between pay-at-closing and pay-up-front workflows
    const isPayAtClosing = booking.request_pay_at_closing === true;
    console.log(`[INFO] Booking payment type: ${isPayAtClosing ? 'PAY-AT-CLOSING' : 'PAY-UP-FRONT'}`);
    
    if (isPayAtClosing) {
      console.log('[INFO] Processing PAY-AT-CLOSING deposit invoice workflow');
      console.log('[INFO] Booking details:', JSON.stringify(booking));
      try {
        // Create Invoice record for deposit
        const invoiceNumber = `INV-PAC-${Date.now()}`;
        const packageMinimumPrices = {
          'mls_walkthrough': 500,
          'photo_essentials': 750,
          'photo_cinematic': 1200,
          'premium_bundle': 1500
        };
        const packageMinimum = packageMinimumPrices[booking.package] || booking.total_price;
        const depositAmount = 50;
        
        // Generate PDF with Stripe payment link
        const pdfResponse = await base44.asServiceRole.functions.invoke('generatePayAtClosingDepositInvoicePDF', {
          invoiceNumber,
          booking,
          depositAmount
        });
        
        const { pdfBytes: pdfBytesArray, stripeUrl, stripePaymentLinkId } = pdfResponse.data;
        const pdfBytes = new Uint8Array(pdfBytesArray);
        
        const invoice = await base44.asServiceRole.entities.Invoice.create({
          invoice_number: invoiceNumber,
          invoice_type: 'deposit',
          job_id: existingJobs && existingJobs.length > 0 ? existingJobs[0].id : null,
          booking_id: bookingId,
          client_name: booking.client_name,
          client_email: booking.client_email,
          job_address: propertyAddress,
          service_date: booking.preferred_date,
          package: booking.package,
          add_ons: booking.add_ons || [],
          amount: packageMinimum,
          deposit_amount: depositAmount,
          payment_status: 'unpaid',
          pay_at_closing: true,
          pay_at_closing_rate: 0.05,
          package_minimum: packageMinimum,
          stripe_payment_link_id: stripePaymentLinkId,
          stripe_payment_link_url: stripeUrl
        });
        
        console.log('[INFO] Created Invoice record:', invoice.id);

        // Upload to Google Drive - same folder as pay upfront
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
        const unpaidFolderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';
        const fileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;
        const boundary = 'boundary_arriv_invoice';
        const metadata = JSON.stringify({ name: fileName, parents: [unpaidFolderId] });

        const textEncoder = new TextEncoder();
        const before = textEncoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
        const after = textEncoder.encode(`\r\n--${boundary}--`);
        const uploadBody = new Uint8Array(before.length + pdfBytes.length + after.length);
        uploadBody.set(before);
        uploadBody.set(new Uint8Array(pdfBytes), before.length);
        uploadBody.set(after, before.length + pdfBytes.length);

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`
          },
          body: uploadBody
        });

        const uploadedFile = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(`Drive upload failed: ${uploadedFile.error?.message}`);

        const pdfFileId = uploadedFile.id;

        // Make publicly viewable
        await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });

        const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const { webViewLink: driveViewLink } = await fileDetailsRes.json();

        // Send email via Brevo
        const adminEmail = Deno.env.get('ADMIN_EMAIL');
        const firstName = booking.client_name.split(' ')[0];

        const htmlEmailBody = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Thank you for choosing Arriv Estate Media for your property at <strong>${propertyAddress}</strong>!</p>
  <p>We've received your booking request for a pay-at-closing property. Your deposit invoice is ready below.</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${driveViewLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
      👉 View Invoice
    </a>
  </p>
  <p><strong>Deposit Due: $${depositAmount.toFixed(2)}</strong></p>
  <p>Once your property closes, please let us know so we can send the final invoice.</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body>
</html>`;

        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': Deno.env.get('BREVO_API_KEY'), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
            to: [{ email: booking.client_email, name: booking.client_name }],
            subject: `Your Deposit Invoice #${invoiceNumber}`,
            htmlContent: htmlEmailBody
          })
        });

        const brevoData = await brevoResponse.json();
        if (!brevoResponse.ok) {
          console.error('[ERROR] Brevo failed:', brevoData);
          throw new Error(`Brevo error: ${brevoData.message}`);
        }

        // Update invoice record
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          google_drive_unpaid_url: driveViewLink,
          google_drive_file_id: pdfFileId,
          email_sent_at: new Date().toISOString()
        });
        
        console.log('[INFO] Sent deposit invoice email to', booking.client_email, 'via Brevo');

        // Create ClosingDetection record to monitor for closing
        const jobId = existingJobs && existingJobs.length > 0 ? existingJobs[0].id : null;
        if (jobId) {
          await base44.asServiceRole.entities.ClosingDetection.create({
            job_id: jobId,
            job_address: propertyAddress,
            monitoring_start_date: booking.preferred_date,
            status: 'pending'
          });
          console.log('[INFO] Created ClosingDetection record for monitoring');
        }
      } catch (error) {
        console.error('Failed to handle pay-at-closing workflow:', error);
      }
    } else {
      console.log('[INFO] Skipping pay-at-closing process - this is a PAY-UP-FRONT booking');
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});