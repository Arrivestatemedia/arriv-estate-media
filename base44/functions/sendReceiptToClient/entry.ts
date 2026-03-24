import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceId } = await req.json();
    
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];
    
    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    // Get Gmail access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    
    const refundPolicy = `\n\n---\n*Refund Policy\n\nArriv Estate Media LLC is committed to delivering high-quality media and offers revisions or reshoots when necessary to meet expectations.\n\nDue to the time and production involved, completed services are generally non-refundable. However, partial refunds may be issued at ARRIV's discretion.\n\nMedia usage rights are granted upon full payment. In the event of a refund, usage rights may be adjusted accordingly.`;

    const emailBody = `Hi ${invoice.client_name.split(' ')[0]},

Thank you for your payment! We've received your payment for the media services at ${invoice.job_address}.

Receipt details:
Amount Paid: $${invoice.amount}
Payment Date: ${new Date(invoice.paid_at).toLocaleDateString()}

Your appointment is confirmed. We look forward to working with you!

Best regards,
Bradley Burke
Arriv Estate Media
📞 678-242-9107
🌐 arrivestatemedia.com${refundPolicy}`;

    const message = [
      `To: ${invoice.client_email}`,
      `Subject: Payment Receipt - ${invoice.job_address}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      emailBody
    ].join('\r\n');
    
    const encodedMessage = btoa(unescape(encodeURIComponent(message)));
    
    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: encodedMessage
      })
    });
    
    if (!gmailResponse.ok) {
      const error = await gmailResponse.json();
      throw new Error(`Gmail error: ${error.error?.message || 'Unknown error'}`);
    }
    
    return Response.json({ success: true });
    
  } catch (error) {
    console.error('Error sending receipt:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});