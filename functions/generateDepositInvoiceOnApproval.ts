import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb } from 'npm:pdf-lib@^1.17.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const bookingId = body.bookingId || body.booking_id;
    const actionType = body.actionType || body.action_type || 'post_to_job_board';
    
    if (!bookingId) {
      return Response.json({ error: 'bookingId is required' }, { status: 400 });
    }
    
    // Get booking
    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }
    
    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    
    // Create job
    const contractorPackagePricing = {
      'mls_walkthrough': 60,
      'photo_essentials': 150,
      'photo_cinematic': 250,
      'premium_bundle': 325
    };
    const contractorAddonPricing = {
      'drone': 60, '3d_tour': 60, 'twilight': 40,
      'vertical_reel': 25, 'ai_staging': 0, 'rush_delivery': 0
    };
    
    const packageRate = contractorPackagePricing[booking.package] || 0;
    const addonsTotal = (booking.add_ons || []).reduce((sum, addon) => sum + (contractorAddonPricing[addon] || 0), 0);
    const contractorPayRate = packageRate + addonsTotal;
    
    const existingJobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    let jobId = null;
    
    if (!existingJobs || existingJobs.length === 0) {
      const newJob = await base44.asServiceRole.entities.Job.create({
        title: `Photography - ${propertyAddress}`,
        type: 'photo',
        description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
        location: propertyAddress,
        date: booking.preferred_date,
        start_time: booking.preferred_time,
        duration_hours: 2,
        pay_rate: contractorPayRate,
        client_price: booking.total_price,
        status: actionType === 'post_to_job_board' ? 'open' : 'booked',
        from_booking: true,
        booking_id: bookingId,
        package: booking.package,
        add_ons: booking.add_ons || [],
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone,
        ...(actionType === 'accept_for_myself' && {
          booked_by: user.email,
          booked_by_name: user.full_name,
          booked_by_phone: Deno.env.get('ADMIN_PHONE') || ''
        })
      });
      jobId = newJob.id;
    } else {
      jobId = existingJobs[0].id;
    }

    // Deposit amount
    let depositAmount = 50;
    if (booking.client_email === 'BradCBurke@gmail.com' || booking.client_email.includes('test-user')) {
      depositAmount = 1;
    }

    // Package metadata
    const packagePrices = {
      'mls_walkthrough': 100,
      'photo_essentials': 275,
      'photo_cinematic': 475,
      'premium_bundle': 675
    };
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
    const addonPrices = {
      'drone': 125, '3d_tour': 125, 'twilight': 125,
      'rush_delivery': 100, 'vertical_reel': 40, 'ai_staging': 125
    };

    const packageData = {
      'mls_walkthrough': { rate: 0.0003 },
      'photo_essentials': { rate: 0.0005 },
      'photo_cinematic': { rate: 0.0008 },
      'premium_bundle': { rate: 0.0010 }
    };

    let packageMinimum = packagePrices[booking.package] || 0;
    (booking.add_ons || []).forEach(addon => { packageMinimum += addonPrices[addon] || 0; });
    const payAtClosingRate = packageData[booking.package]?.rate || 0.0008;
    const addOns = booking.add_ons || [];
    const basePkgAmount = packagePrices[booking.package] || 0;

    // Generate invoice number
    const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1);
    let lastNumber = 1000;
    if (allInvoices.length > 0 && allInvoices[0].invoice_number) {
      const num = parseInt(allInvoices[0].invoice_number);
      if (!isNaN(num)) lastNumber = num;
    }
    const invoiceNumber = String(lastNumber + 1);

    // Create Stripe payment link
    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `Booking Deposit - ${booking.street_address}`,
        'line_items[0][price_data][unit_amount]': String(depositAmount * 100),
        'line_items[0][quantity]': '1',
      }),
    });
    const stripeData = await stripeResponse.json();
    if (!stripeResponse.ok) {
      throw new Error(`Stripe error: ${stripeData.error?.message || 'Unknown error'}`);
    }

    // Generate PDF (same structure as pay up front)
    console.log('Generating deposit invoice PDF...');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);

    const gold = rgb(0.72, 0.59, 0.42);
    const black = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.4, 0.4, 0.4);

    let y = 750;

    page.drawText('ARRIV ESTATE MEDIA', { x: 50, y, size: 18, color: gold });
    y -= 30;
    page.drawText('DEPOSIT INVOICE', { x: 50, y, size: 14, color: black });
    page.drawText(`#${invoiceNumber}`, { x: 480, y, size: 14, color: black });
    y -= 25;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
    y -= 20;

    const invoiceDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    page.drawText(`Date: ${invoiceDate}`, { x: 50, y, size: 10, color: black });
    y -= 25;

    page.drawText('BILL TO:', { x: 50, y, size: 10, color: gold });
    y -= 15;
    page.drawText(booking.client_name, { x: 50, y, size: 12, color: black });
    y -= 15;
    page.drawText(propertyAddress, { x: 50, y, size: 12, color: black, maxWidth: 400 });
    y -= 30;

    page.drawText('SERVICES', { x: 50, y, size: 10, color: gold });
    y -= 15;
    page.drawText(packageNames[booking.package] || booking.package, { x: 50, y, size: 12, color: black });
    page.drawText(`$${basePkgAmount.toFixed(2)}`, { x: 480, y, size: 12, color: black });
    y -= 18;

    for (const addon of addOns) {
      page.drawText(`  + ${addonDescriptions[addon] || addon}`, { x: 50, y, size: 10, color: black });
      y -= 14;
    }

    y -= 15;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
    y -= 25;

    page.drawText('DEPOSIT DUE NOW', { x: 50, y, size: 11, color: gold });
    page.drawText(`$${depositAmount.toFixed(2)}`, { x: 480, y, size: 16, color: black });
    y -= 30;

    page.drawText('(Remaining balance due at closing)', { x: 50, y, size: 9, color: gray });
    y -= 30;

    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
    y -= 20;

    page.drawText('PAY-AT-CLOSING TERMS', { x: 50, y, size: 10, color: gold });
    y -= 15;
    const termsLines = [
      'If any of the following occur, this agreement converts to the package minimum flat fee',
      '(less deposit paid), due within 7 days of written notice:',
      '1. Property withdrawn, cancelled, or expired',
      '2. Listing terminated, transferred, or reassigned',
      '3. Property relisted under a new MLS number',
      '4. Seller changes representation',
      '5. Property rented, leased, or disposed of without a sale',
      '6. Sale does not occur within 6 months of original listing date',
      '7. Payment not received at closing for any reason'
    ];
    for (const line of termsLines) {
      page.drawText(line, { x: 50, y, size: 8, color: black, maxWidth: 500 });
      y -= 12;
    }
    y -= 10;

    page.drawText('PAYMENT', { x: 50, y, size: 10, color: gold });
    y -= 15;
    page.drawText('Please use the link below to submit your deposit:', { x: 50, y, size: 10, color: black });
    y -= 15;
    page.drawText(stripeData.url, { x: 50, y, size: 9, color: rgb(0, 0, 0.8), maxWidth: 500 });

    page.drawText('Thank you for your business!', { x: 50, y: 50, size: 10, color: black });
    page.drawText('Arriv Estate Media | 678-242-9107 | arrivestatemedia.com', { x: 50, y: 30, size: 9, color: gray });

    const pdfBytes = await pdfDoc.save();
    console.log('PDF generated, size:', pdfBytes.length);

    // Upload PDF to Google Drive (UNPAID folder) - same as pay up front
    console.log('Uploading to Google Drive...');
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    const unpaidFolderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';
    const fileName = `DepositInvoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;
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
    console.log('Uploaded file ID:', pdfFileId);

    await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const { webViewLink: driveViewLink } = await fileDetailsRes.json();

    // Send invoice email via Brevo - same as pay up front
    console.log('Sending invoice email via Brevo...');
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');
    const firstName = booking.client_name.split(' ')[0];

    const htmlEmailBody = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Your deposit invoice for media services at <strong>${propertyAddress}</strong> is ready. Please use the link below to view your invoice and submit your deposit to confirm your booking.</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${driveViewLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
      👉 View Invoice
    </a>
  </p>
  <p>If you have any questions, feel free to reach out.</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body>
</html>`;

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
        to: [{ email: booking.client_email, name: booking.client_name }],
        subject: 'Your Deposit Invoice from Arriv Estate Media',
        htmlContent: htmlEmailBody
      })
    });

    const brevoData = await brevoResponse.json();
    if (!brevoResponse.ok) throw new Error(`Brevo error: ${brevoData.message}`);
    console.log('Email sent, messageId:', brevoData.messageId);

    // Create invoice record - same fields as pay up front
    const invoice = await base44.asServiceRole.entities.Invoice.create({
      invoice_number: invoiceNumber,
      invoice_type: 'deposit',
      booking_id: bookingId,
      job_id: jobId,
      client_name: booking.client_name,
      client_email: booking.client_email,
      job_address: propertyAddress,
      service_date: booking.preferred_date,
      package: booking.package,
      add_ons: addOns,
      amount: depositAmount,
      deposit_amount: depositAmount,
      payment_status: 'unpaid',
      stripe_payment_link_id: stripeData.id,
      stripe_payment_link_url: stripeData.url,
      google_drive_unpaid_url: driveViewLink,
      google_drive_file_id: pdfFileId,
      pay_at_closing: true,
      pay_at_closing_rate: payAtClosingRate,
      package_minimum: packageMinimum,
      email_sent_at: new Date().toISOString()
    });

    // Create closing detection record
    await base44.asServiceRole.entities.ClosingDetection.create({
      job_id: jobId,
      job_address: propertyAddress,
      monitoring_start_date: booking.preferred_date,
      status: 'pending'
    });

    // Update booking status
    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    return Response.json({ 
      success: true,
      message: 'Action completed',
      jobId,
      invoiceId: invoice.id,
      invoiceNumber,
      stripeLink: stripeData.url,
      driveViewLink
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});