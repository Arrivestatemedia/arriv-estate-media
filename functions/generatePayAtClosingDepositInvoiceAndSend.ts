import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb } from 'npm:pdf-lib@^1.17.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const { invoiceId, booking, invoiceNumber, jobAddress, depositAmount, packageMinimum } = await req.json();

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const gold = rgb(0.72, 0.59, 0.42);
    const black = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.5, 0.5, 0.5);

    let y = 750;

    // Header
    page.drawText('ARRIV ESTATE MEDIA', {
      x: 50,
      y,
      size: 20,
      color: black,
      font: await pdfDoc.embedFont('Helvetica-Bold')
    });
    y -= 25;

    page.drawText('Deposit Invoice', {
      x: 50,
      y,
      size: 14,
      color: gold,
      font: await pdfDoc.embedFont('Helvetica-Bold')
    });
    y -= 35;

    // Invoice details
    const invoiceDetailsFont = await pdfDoc.embedFont('Helvetica');
    page.drawText(`Invoice #: ${invoiceNumber}`, { x: 50, y, size: 10, color: black, font: invoiceDetailsFont });
    y -= 15;
    page.drawText(`Invoice Date: ${new Date().toLocaleDateString()}`, { x: 50, y, size: 10, color: black, font: invoiceDetailsFont });
    y -= 30;

    // Bill to
    page.drawText('BILL TO:', { x: 50, y, size: 10, color: black, font: await pdfDoc.embedFont('Helvetica-Bold') });
    y -= 15;
    page.drawText(booking.client_name, { x: 50, y, size: 10, color: black, font: invoiceDetailsFont });
    y -= 15;
    page.drawText(jobAddress, { x: 50, y, size: 10, color: black, font: invoiceDetailsFont });
    y -= 30;

    // Service details
    page.drawText('SERVICE DETAILS', { x: 50, y, size: 10, color: black, font: await pdfDoc.embedFont('Helvetica-Bold') });
    y -= 15;
    page.drawText(`Service Date: ${booking.preferred_date}`, { x: 50, y, size: 10, color: black, font: invoiceDetailsFont });
    y -= 15;
    page.drawText(`Package: ${booking.package}`, { x: 50, y, size: 10, color: black, font: invoiceDetailsFont });
    y -= 30;

    // Terms info
    page.drawText('PAY-AT-CLOSING TERMS', { x: 50, y, size: 10, color: black, font: await pdfDoc.embedFont('Helvetica-Bold') });
    y -= 15;
    page.drawText('This property is on a Pay-at-Closing arrangement.', { x: 50, y, size: 10, color: black, font: invoiceDetailsFont });
    y -= 15;
    page.drawText('Deposit is due upon booking confirmation.', { x: 50, y, size: 10, color: black, font: invoiceDetailsFont });
    y -= 15;
    page.drawText('Final balance will be invoiced after closing.', { x: 50, y, size: 10, color: black, font: invoiceDetailsFont });
    y -= 35;

    // Amounts table
    page.drawText('AMOUNT DUE', { x: 50, y, size: 10, color: black, font: await pdfDoc.embedFont('Helvetica-Bold') });
    y -= 20;
    page.drawText('Deposit Due (Due Now)', { x: 50, y, size: 10, color: black, font: invoiceDetailsFont });
    page.drawText(`$${depositAmount.toFixed(2)}`, { x: 500, y, size: 10, color: black, font: invoiceDetailsFont });
    y -= 30;

    page.drawText('TOTAL DUE NOW: $' + depositAmount.toFixed(2), { 
      x: 50, 
      y, 
      size: 14, 
      color: gold, 
      font: await pdfDoc.embedFont('Helvetica-Bold') 
    });
    y -= 50;

    // Footer
    page.drawText('Thank you for choosing Arriv Estate Media!', { x: 50, y, size: 9, color: gray, font: invoiceDetailsFont });
    y -= 15;
    page.drawText('678-242-9107 | arrivestatemedia.com', { x: 50, y, size: 9, color: gray, font: invoiceDetailsFont });

    const pdfBytes = await pdfDoc.save();

    // Upload to Google Drive
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    
    const boundary = 'boundary_' + Date.now();
    const mimeType = 'application/pdf';
    const metadata = {
      name: `Invoice_${invoiceNumber}_Deposit.pdf`,
      mimeType: 'application/pdf'
    };

    const multipartBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      'Content-Transfer-Encoding: base64',
      '',
      btoa(String.fromCharCode(...pdfBytes)),
      `--${boundary}--`
    ].join('\n');

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body: multipartBody
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
  <p>Thank you for choosing Arriv Estate Media for your property at <strong>${jobAddress}</strong>!</p>
  <p>We've received your booking request for a pay-at-closing property. Your deposit invoice is attached below.</p>
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
    await base44.asServiceRole.entities.Invoice.update(invoiceId, {
      google_drive_unpaid_url: driveViewLink,
      google_drive_file_id: pdfFileId,
      email_sent_at: new Date().toISOString()
    });

    return Response.json({ success: true, invoiceId });

  } catch (error) {
    console.error('Error generating pay-at-closing deposit invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});