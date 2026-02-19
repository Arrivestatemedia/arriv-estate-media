import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb } from 'npm:pdf-lib@^1.17.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Allow both admin users and internal service role calls
    const isAuthenticated = await base44.auth.isAuthenticated();
    if (!isAuthenticated) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      invoiceNumber,
      clientName,
      clientEmail,
      jobAddress,
      amountDue,
      packageName,
      addOns,
      stripePaymentLink,
      packageAmount
    } = await req.json();

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    const unpaidFolderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';

    // Step 1: Generate PDF using pdf-lib
    console.log('Step 1: Generating invoice PDF with pdf-lib...');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size

    const fontSize = 12;
    const smallFontSize = 10;
    const titleFontSize = 18;
    const gold = rgb(0.72, 0.59, 0.42);
    const black = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.4, 0.4, 0.4);

    let y = 750;

    const addonDescriptions = {
      'drone': 'Drone Photography',
      '3d_tour': '3D Virtual Tour',
      'twilight': 'Twilight Photography',
      'rush_delivery': 'Rush Delivery',
      'vertical_reel': 'Vertical Reel',
      'ai_staging': 'AI Staging'
    };

    const packageNames = {
      'mls_walkthrough': 'MLS Walkthrough',
      'photo_essentials': 'Photo Essentials',
      'photo_cinematic': 'Photo + Cinematic Walkthrough',
      'premium_bundle': 'Premium Media Bundle'
    };

    const basePkgAmount = parseFloat(packageAmount) || 0;
    const totalAmount = parseFloat(amountDue) || 0;

    // Header
    page.drawText('ARRIV ESTATE MEDIA', { x: 50, y, size: titleFontSize, color: gold });
    y -= 30;
    page.drawText('INVOICE', { x: 50, y, size: 14, color: black });
    page.drawText(`#${invoiceNumber}`, { x: 480, y, size: 14, color: black });
    y -= 25;

    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
    y -= 20;

    const invoiceDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    page.drawText(`Date: ${invoiceDate}`, { x: 50, y, size: smallFontSize, color: black });
    y -= 25;

    // Bill To
    page.drawText('BILL TO:', { x: 50, y, size: 10, color: gold });
    y -= 15;
    page.drawText(clientName, { x: 50, y, size: fontSize, color: black });
    y -= 15;
    page.drawText(jobAddress, { x: 50, y, size: fontSize, color: black, maxWidth: 400 });
    y -= 30;

    // Services
    page.drawText('SERVICES', { x: 50, y, size: 10, color: gold });
    y -= 15;

    page.drawText(packageNames[packageName] || packageName, { x: 50, y, size: fontSize, color: black });
    page.drawText(`$${basePkgAmount.toFixed(2)}`, { x: 480, y, size: fontSize, color: black });
    y -= 18;

    if (addOns && addOns.length > 0) {
      for (const addon of addOns) {
        const addonName = addonDescriptions[addon] || addon;
        page.drawText(`  + ${addonName}`, { x: 50, y, size: smallFontSize, color: black });
        y -= 14;
      }
    }

    y -= 15;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
    y -= 25;

    // Total
    page.drawText('AMOUNT DUE', { x: 50, y, size: 11, color: gold });
    page.drawText(`$${totalAmount.toFixed(2)}`, { x: 480, y, size: 16, color: black });
    y -= 45;

    // Payment link
    if (stripePaymentLink) {
      page.drawText('PAYMENT', { x: 50, y, size: 10, color: gold });
      y -= 15;
      page.drawText('Please use the link below to submit payment:', { x: 50, y, size: smallFontSize, color: black });
      y -= 15;
      page.drawText(stripePaymentLink, { x: 50, y, size: 9, color: rgb(0, 0, 0.8), maxWidth: 500 });
      y -= 30;
    }

    // Footer
    page.drawText('Thank you for your business!', { x: 50, y: 50, size: smallFontSize, color: black });
    page.drawText('Arriv Estate Media | 678-242-9107 | arrivestatemedia.com', { x: 50, y: 30, size: 9, color: gray });

    const pdfBytes = await pdfDoc.save();
    console.log('PDF generated, size:', pdfBytes.length);

    // Step 2: Upload PDF to Google Drive
    console.log('Step 2: Uploading PDF to Google Drive...');
    const fileName = `Invoice_${invoiceNumber}_${clientName.replace(/\s+/g, '_')}.pdf`;
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
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload PDF: ${uploadedFile.error?.message}`);
    }

    const pdfFileId = uploadedFile.id;
    console.log('PDF uploaded, file ID:', pdfFileId);

    // Step 3: Make shareable
    await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const { webViewLink: driveViewLink } = await fileDetailsRes.json();
    console.log('Drive view link:', driveViewLink);

    // Step 4: Send email via Brevo
    console.log('Step 4: Sending email via Brevo...');
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');
    const firstName = clientName.split(' ')[0];

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
        to: [{ email: clientEmail, name: clientName }],
        subject: 'Your Invoice from Arriv Estate Media',
        htmlContent: htmlEmailBody
      })
    });

    const brevoData = await brevoResponse.json();
    if (!brevoResponse.ok) {
      throw new Error(`Brevo error: ${brevoData.message || JSON.stringify(brevoData)}`);
    }

    console.log('Email sent, messageId:', brevoData.messageId);

    return Response.json({
      success: true,
      invoiceFileId: pdfFileId,
      driveViewLink,
      messageId: brevoData.messageId
    });

  } catch (error) {
    console.error('Error generating invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});