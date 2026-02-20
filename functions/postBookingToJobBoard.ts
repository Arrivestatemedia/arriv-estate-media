import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb } from 'npm:pdf-lib@^1.17.1';

// Get pay-at-closing rate for package
function getPayAtClosingRate(packageName, totalAddOnPrice) {
  const packageRates = {
    'mls_walkthrough': 0.0003,
    'photo_essentials': 0.0005,
    'photo_cinematic': 0.0008,
    'premium_bundle': 0.0010
  };
  
  const packageRate = packageRates[packageName] || 0.0005;
  
  if (totalAddOnPrice > 0) {
    const combined = packageRate + totalAddOnPrice;
    if (combined <= 300) return 0.0003;
    if (combined <= 400) return 0.0005;
    if (combined <= 600) return 0.0008;
    return 0.0010;
  }
  
  return packageRate;
}

function formatPercentage(rate) {
  return (rate * 100).toFixed(2) + '%';
}

function getAddOnTotal(addOns) {
  const addOnPrices = {
    'Drone add-on (photos + short clips)': 125,
    'Drone': 125,
    '3D Tour': 125,
    'Twilight exterior edits (up to 5 photos)': 125,
    'Twilight': 125,
    'Next day rush delivery (when available)': 100,
    'Rush delivery': 100,
    'Additional vertical reel': 40,
    'Reel': 40,
    'AI Staging': 125,
    'Staging': 125
  };
  
  let total = 0;
  (addOns || []).forEach(addon => {
    total += addOnPrices[addon] || 0;
  });
  return total;
}

async function generatePayAtClosingDepositPDF(booking, invoiceNumber, jobAddress, depositAmount, packageMinimum) {
  const addOnTotal = getAddOnTotal(booking.add_ons);
  const rate = getPayAtClosingRate(booking.package, addOnTotal);
  const rateDisplay = formatPercentage(rate);

  const packageNames = {
    'mls_walkthrough': 'MLS Walkthrough',
    'photo_essentials': 'Photo Essentials',
    'photo_cinematic': 'Photo + Cinematic Walkthrough',
    'premium_bundle': 'Premium Media Bundle'
  };

  const addonDescriptions = {
    'drone': 'Drone Photography',
    '3d_tour': '3D Virtual Tour',
    'twilight': 'Twilight Photography',
    'rush_delivery': 'Rush Delivery',
    'vertical_reel': 'Vertical Reel',
    'ai_staging': 'AI Staging'
  };

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const gold = rgb(0.72, 0.59, 0.42);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);

  let y = 750;

  // Header matching pay upfront style
  page.drawText('ARRIV ESTATE MEDIA', { x: 50, y, size: 18, color: gold });
  y -= 30;
  page.drawText('INVOICE', { x: 50, y, size: 14, color: black });
  page.drawText(`#${invoiceNumber}`, { x: 480, y, size: 14, color: black });
  y -= 25;
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
  y -= 20;

  const invoiceDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  page.drawText(`Date: ${invoiceDate}`, { x: 50, y, size: 10, color: black });
  y -= 25;

  // Bill to
  page.drawText('BILL TO:', { x: 50, y, size: 10, color: gold });
  y -= 15;
  page.drawText(booking.client_name, { x: 50, y, size: 12, color: black });
  y -= 15;
  page.drawText(jobAddress, { x: 50, y, size: 12, color: black, maxWidth: 400 });
  y -= 30;

  // Services
  page.drawText('SERVICES', { x: 50, y, size: 10, color: gold });
  y -= 15;
  page.drawText(packageNames[booking.package] || booking.package, { x: 50, y, size: 12, color: black });
  y -= 18;

  // Add-ons
  const addOns = booking.add_ons || [];
  for (const addon of addOns) {
    page.drawText(`  + ${addonDescriptions[addon] || addon}`, { x: 50, y, size: 10, color: black });
    y -= 14;
  }

  y -= 15;
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
  y -= 25;

  // Pay-at-closing details
  page.drawText('PAY-AT-CLOSING DETAILS', { x: 50, y, size: 10, color: gold });
  y -= 18;
  page.drawText('Booking Deposit Due Now:', { x: 50, y, size: 10, color: black });
  page.drawText(`$${depositAmount.toFixed(2)}`, { x: 480, y, size: 12, color: black });
  y -= 18;
  page.drawText('Package Minimum:', { x: 50, y, size: 10, color: black });
  page.drawText(`$${packageMinimum.toFixed(2)}`, { x: 480, y, size: 12, color: black });
  y -= 18;
  page.drawText('Pay-at-Closing Rate:', { x: 50, y, size: 10, color: black });
  page.drawText(rateDisplay, { x: 480, y, size: 12, color: black });
  y -= 25;

  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
  y -= 25;

  page.drawText('AMOUNT DUE NOW', { x: 50, y, size: 11, color: gold });
  page.drawText(`$${depositAmount.toFixed(2)}`, { x: 480, y, size: 16, color: black });
  y -= 45;

  // Payment instructions
  page.drawText('PAYMENT', { x: 50, y, size: 10, color: gold });
  y -= 15;
  page.drawText('Please use the payment link you received to submit your deposit.', { x: 50, y, size: 10, color: black });
  y -= 20;

  // Pay-at-closing terms
  page.drawText('PAY-AT-CLOSING TERMS', { x: 50, y, size: 10, color: gold });
  y -= 15;
  page.drawText('If any of the following occur, this Agreement converts to a flat fee of the', { x: 50, y, size: 9, color: black });
  y -= 12;
  page.drawText('package minimum, payable within seven (7) days (less deposit paid):', { x: 50, y, size: 9, color: black });
  y -= 16;

  const terms = [
    '• Property is withdrawn, canceled, or expires',
    '• Listing is terminated or transferred to another agent/brokerage',
    '• Property is relisted under a new MLS number',
    '• Seller changes representation',
    '• Property is rented or disposed of without sale',
    '• Sale does not occur within six (6) months of listing',
    '• Payment is not received at closing'
  ];

  for (const term of terms) {
    if (y < 100) {
      page = pdfDoc.addPage([612, 792]);
      y = 750;
    }
    page.drawText(term, { x: 70, y, size: 8, color: black });
    y -= 12;
  }

  page.drawText('Thank you for your business!', { x: 50, y: 50, size: 10, color: black });
  page.drawText('Arriv Estate Media | 678-242-9107 | arrivestatemedia.com', { x: 50, y: 30, size: 9, color: gray });

  return await pdfDoc.save();
}

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
          package_minimum: packageMinimum
        });
        
        console.log('[INFO] Created Invoice record:', invoice.id);
        
        // Generate PDF
        const pdfBytes = await generatePayAtClosingDepositPDF(booking, invoiceNumber, propertyAddress, depositAmount, packageMinimum);

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
        if (!brevoResponse.ok) throw new Error(`Brevo error: ${brevoData.message}`);

        // Update invoice record
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          google_drive_unpaid_url: driveViewLink,
          google_drive_file_id: pdfFileId,
          email_sent_at: new Date().toISOString()
        });
        
        console.log('[INFO] Sent deposit invoice PDF email via Brevo');

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