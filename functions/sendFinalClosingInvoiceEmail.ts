import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { clientEmail, clientName, jobAddress, finalSalePrice, balanceDue, invoiceId } = await req.json();

    const gmailToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

    // Get invoice details to create attachment
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];

    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Generate invoice HTML/PDF
    const invoiceHTML = await base44.asServiceRole.functions.invoke('generateFinalClosingInvoicePDF', {
      invoiceNumber: invoice.invoice_number,
      clientName: invoice.client_name,
      jobAddress: invoice.job_address,
      serviceDate: invoice.service_date,
      packageName: invoice.package,
      addOns: invoice.add_ons || [],
      finalSalePrice: finalSalePrice,
      payAtClosingRate: invoice.pay_at_closing_rate || 0.0008,
      depositPaid: 50
    });

    const htmlContent = invoiceHTML.data?.html;
    if (!htmlContent) {
      throw new Error('Failed to generate invoice HTML');
    }

    // Create email with HTML content
    const emailSubject = `Your Final Invoice for ${jobAddress}`;
    const emailBody = `
<html>
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2>Congratulations on your listing being sold!</h2>
  
  <p>Dear ${clientName.split(' ')[0]},</p>
  
  <p>We are thrilled to share the wonderful news that your property has sold! Please find attached your final invoice below.</p>
  
  <div style="background-color: #f9f9f9; padding: 20px; margin: 20px 0; border-left: 4px solid #b8956a;">
    <p><strong>Final Sale Price:</strong> $${finalSalePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
    <p><strong>Balance Due:</strong> $${balanceDue.toFixed(2)}</p>
  </div>

  <p>Once you process payment through the secure Stripe link, we will provide you with a receipt confirmation. Thank you for partnering with Arriv Estate Media!</p>
  
  <p>If you have any questions, please don't hesitate to reach out.</p>
  
  <p>Best regards,<br>
  <strong>Arriv Estate Media</strong></p>
</body>
</html>
    `;

    // Encode message
    const emailMessage = [
      `From: ${Deno.env.get('ADMIN_EMAIL')}`,
      `To: ${clientEmail}`,
      `Subject: ${emailSubject}`,
      `Content-Type: text/html; charset="UTF-8"`,
      '',
      emailBody
    ].join('\r\n');

    const encodedMessage = btoa(emailMessage).replace(/\+/g, '-').replace(/\//g, '_');

    // Send via Gmail
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gmailToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: encodedMessage
      })
    });

    const sendData = await sendRes.json();
    if (!sendData.id) {
      throw new Error('Failed to send email: ' + JSON.stringify(sendData));
    }

    console.log('[INFO] Final closing invoice email sent:', sendData.id);

    return Response.json({
      success: true,
      message: 'Final closing invoice email sent successfully'
    });

  } catch (error) {
    console.error('Error sending final closing invoice email:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});