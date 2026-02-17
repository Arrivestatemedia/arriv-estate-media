import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceId, finalSalePrice, closingDate } = await req.json();
    
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];
    
    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    
    const emailBody = `Hi ${invoice.client_name.split(' ')[0]},

We see that the home has closed—congratulations!

Your final invoice for media services at ${invoice.job_address} is ready. Please use the link below to view the invoice and submit payment at your convenience.

👉 View Invoice: ${invoice.tracked_link_url}

Sale Price: $${finalSalePrice.toLocaleString()}
Rate: ${(invoice.pay_at_closing_rate * 100).toFixed(2)}%
Total Fee: $${(finalSalePrice * invoice.pay_at_closing_rate).toFixed(2)}
Deposit Applied: -$${invoice.deposit_amount}
Balance Due: $${invoice.amount.toFixed(2)}

If you have any questions or need anything at all, feel free to reach out. Thank you again for the opportunity to work with you.

Best regards,
Bradley Burke
Arriv Estate Media
📞 678-242-9107
🌐 arrivestatemedia.com`;

    const message = [
      `To: ${invoice.client_email}`,
      `Subject: Final Invoice - Property Closed at ${invoice.job_address}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      emailBody
    ].join('\r\n');
    
    const encodedMessage = btoa(unescape(encodeURIComponent(message)));
    
    await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: encodedMessage
      })
    });
    
    await base44.asServiceRole.entities.Invoice.update(invoiceId, {
      email_sent_at: new Date().toISOString()
    });
    
    await base44.asServiceRole.functions.invoke('logHubSpotEvent', {
      contactEmail: invoice.client_email,
      eventType: 'email_sent',
      invoiceId,
      jobAddress: invoice.job_address,
      details: {
        subject: 'Final Invoice - Property Closed',
        trackedLink: invoice.tracked_link_url,
        finalSalePrice,
        closingDate
      }
    });
    
    return Response.json({ success: true });
    
  } catch (error) {
    console.error('Error sending closing invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});