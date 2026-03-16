import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

const REFUND_RECEIPTS_FOLDER_ID = '14JQWnqjP-CTm_5Ej-NvmG8x2QKboly1r';

async function generateRefundPDF({ clientName, clientEmail, jobAddress, serviceDate, pkg, originalAmount, refundAmount, netAmount }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Header
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('ARRIV ESTATE MEDIA', { x: 40, y: height - 50, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Refund Receipt', { x: 40, y: height - 68, size: 11, font: regular, color: rgb(0.72, 0.58, 0.42) });

  let y = height - 120;
  const line = (label, value, isBold = false) => {
    page.drawText(label, { x: 40, y, size: 11, font: isBold ? bold : regular, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(value, { x: 400, y, size: 11, font: isBold ? bold : regular, color: rgb(0.1, 0.1, 0.1) });
    y -= 22;
  };

  line('Invoice #', '1016');
  line('Client', clientName);
  line('Email', clientEmail);
  line('Property', jobAddress);
  line('Service Date', serviceDate);
  line('Package', pkg);

  y -= 10;
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 25;

  line('Original Amount Paid', `$${originalAmount.toFixed(2)}`);
  page.drawText('Refund Applied', { x: 40, y, size: 11, font: bold, color: rgb(0.85, 0.2, 0.2) });
  page.drawText(`-$${refundAmount.toFixed(2)}`, { x: 400, y, size: 11, font: bold, color: rgb(0.85, 0.2, 0.2) });
  y -= 22;

  y -= 5;
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 2, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;

  page.drawText('Net Total', { x: 40, y, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`$${netAmount.toFixed(2)}`, { x: 400, y, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });

  return await pdfDoc.save();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceId, refundAmount, clientEmail, clientName, originalAmount, jobAddress, serviceDate, package: pkg } = await req.json();

    const netAmount = originalAmount - refundAmount;

    const emailBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv" style="height: 50px;" />
  </div>

  <div style="background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h2 style="color: #1A1A1A; margin-top: 0;">Refund Receipt</h2>
    <p style="color: #666;">Hi ${clientName},</p>
    <p style="color: #666;">Your refund has been processed. Below is your updated receipt reflecting the adjustment.</p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />

    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #666;">Invoice #</td>
        <td style="padding: 8px 0; text-align: right; font-weight: bold;">1016</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Property</td>
        <td style="padding: 8px 0; text-align: right;">${jobAddress}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Service Date</td>
        <td style="padding: 8px 0; text-align: right;">${serviceDate}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #666;">Package</td>
        <td style="padding: 8px 0; text-align: right;">${pkg}</td>
      </tr>
    </table>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />

    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #666;">Original Amount Paid</td>
        <td style="padding: 8px 0; text-align: right;">$${originalAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #e53e3e; font-weight: bold;">Refund Applied</td>
        <td style="padding: 8px 0; text-align: right; color: #e53e3e; font-weight: bold;">-$${refundAmount.toFixed(2)}</td>
      </tr>
      <tr style="border-top: 2px solid #1A1A1A;">
        <td style="padding: 12px 0; font-size: 18px; font-weight: bold; color: #1A1A1A;">Net Total</td>
        <td style="padding: 12px 0; text-align: right; font-size: 18px; font-weight: bold; color: #1A1A1A;">$${netAmount.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  <p style="color: #666; font-size: 14px;">If you have any questions, please don't hesitate to reach out. We appreciate your business!</p>

  <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
    Arriv Estate Media · Real Estate Photography & Video
  </p>
</body>
</html>
    `.trim();

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': Deno.env.get('BREVO_API_KEY'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Arriv Estate Media', email: 'noreply@arrivestatemedia.com' },
        to: [{ email: clientEmail, name: clientName }],
        subject: `Refund Receipt – Invoice #1016 | Arriv Estate Media`,
        htmlContent: emailBody
      })
    });
    if (!brevoRes.ok) {
      const err = await brevoRes.text();
      throw new Error('Brevo error: ' + err);
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});