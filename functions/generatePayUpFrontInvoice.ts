import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb } from 'npm:pdf-lib@^1.17.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { bookingId, booking, total_price } = await req.json();

    if (!booking || !bookingId || !total_price) {
      return Response.json({ error: 'Missing required data' }, { status: 400 });
    }

    const totalAmount = parseFloat(total_price);

    // Generate invoice number
    const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1);
    const lastNumber = allInvoices.length > 0 && allInvoices[0].invoice_number 
      ? parseInt(allInvoices[0].invoice_number) 
      : 1000;
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
        'line_items[0][price_data][product_data][name]': `Media Services - ${booking.street_address}`,
        'line_items[0][price_data][unit_amount]': String(Math.round(totalAmount * 100)),
        'line_items[0][quantity]': '1',
      }),
    });

    const stripeData = await stripeResponse.json();
    if (!stripeResponse.ok) {
      throw new Error(`Stripe error: ${stripeData.error?.message || 'Unknown error'}`);
    }

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

    const jobAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    const basePkgAmount = packagePrices[booking.package] || 0;
    const addOns = booking.add_ons || [];

    // Generate PDF
    console.log('Generating invoice PDF...');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);

    const gold = rgb(0.72, 0.59, 0.42);
    const black = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.4, 0.4, 0.4);

    let y = 750;

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

    page.drawText('BILL TO:', { x: 50, y, size: 10, color: gold });
    y -= 15;
    page.drawText(booking.client_name, { x: 50, y, size: 12, color: black });
    y -= 15;
    page.drawText(jobAddress, { x: 50, y, size: 12, color: black, maxWidth: 400 });
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

    page.drawText('AMOUNT DUE', { x: 50, y, size: 11, color: gold });
    page.drawText(`$${totalAmount.toFixed(2)}`, { x: 480, y, size: 16, color: black });
    y -= 45;

    page.drawText('PAYMENT', { x: 50, y, size: 10, color: gold });
    y -= 15;
    page.drawText('Please use the link below to submit payment:', { x: 50, y, size: 10, color: black });
    y -= 15;
    page.drawText(stripeData.url, { x: 50, y, size: 9, color: rgb(0, 0, 0.8), maxWidth: 500 });

    page.drawText('Thank you for your business!', { x: 50, y: 50, size: 10, color: black });
    page.drawText('Arriv Estate Media | 678-242-9107 | arrivestatemedia.com', { x: 50, y: 30, size: 9, color: gray });

    const pdfBytes = await pdfDoc.save();
    console.log('PDF generated, size:', pdfBytes.length);

    // Upload PDF to Google Drive
    console.log('Uploading to Google Drive...');
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

    // Send invoice email via Brevo
    console.log('Sending invoice email...');
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');
    const firstName = booking.client_name.split(' ')[0];

    const htmlEmailBody = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Your invoice for media services at <strong>${jobAddress}</strong> is ready. Please use the link below to view your invoice and submit payment at your convenience.</p>
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
        subject: 'Your Invoice from Arriv Estate Media',
        htmlContent: htmlEmailBody
      })
    });

    const brevoData = await brevoResponse.json();
    if (!brevoResponse.ok) throw new Error(`Brevo error: ${brevoData.message}`);
    console.log('Email sent, messageId:', brevoData.messageId);

    // Create invoice record
    const invoice = await base44.asServiceRole.entities.Invoice.create({
      invoice_number: invoiceNumber,
      invoice_type: 'pay_up_front',
      booking_id: bookingId,
      client_name: booking.client_name,
      client_email: booking.client_email,
      job_address: jobAddress,
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

    return Response.json({ 
      success: true, 
      invoiceId: invoice.id,
      invoiceNumber,
      stripeLink: stripeData.url,
      driveViewLink
    });

  } catch (error) {
    console.error('Error generating invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});