import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: clientEmail,
      subject: `Refund Receipt – Invoice #1016 | Arriv Estate Media`,
      body: emailBody,
      from_name: 'Arriv Estate Media'
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});