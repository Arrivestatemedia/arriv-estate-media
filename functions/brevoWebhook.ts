import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const event = await req.json();
    console.log('Brevo webhook event:', JSON.stringify(event).substring(0, 500));

    // We only care about click events
    if (event.event !== 'click') {
      return Response.json({ received: true });
    }

    const clientEmail = event.email;
    const clickedUrl = event.link || event.url || '';
    const subject = event.subject || '';

    // Only notify for invoice emails
    const isInvoiceEmail = subject.toLowerCase().includes('invoice') || subject.toLowerCase().includes('reminder');
    if (!isInvoiceEmail) {
      return Response.json({ received: true });
    }

    // Look up the invoice by client email to get property info
    let invoiceInfo = '';
    try {
      const invoices = await base44.asServiceRole.entities.Invoice.filter({
        client_email: clientEmail,
        payment_status: 'unpaid'
      });
      if (invoices && invoices.length > 0) {
        // Get the most recent unpaid invoice for this client
        const invoice = invoices[0];
        invoiceInfo = `\nProperty: ${invoice.job_address}\nAmount: $${invoice.amount ? invoice.amount.toFixed(2) : '—'}`;

        // Record the click time if not already set
        if (!invoice.link_clicked_at) {
          await base44.asServiceRole.entities.Invoice.update(invoice.id, {
            link_clicked_at: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      console.error('Invoice lookup error:', e.message);
    }

    // Send SMS to admin
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
    const adminPhone = Deno.env.get('ADMIN_PHONE');

    const smsBody = `📧 Invoice link clicked!\nClient: ${clientEmail}${invoiceInfo}\nSubject: ${subject}`;

    const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromPhone,
        To: adminPhone,
        Body: smsBody
      })
    });

    if (!smsRes.ok) {
      const err = await smsRes.json();
      console.error('Twilio SMS error:', err);
    } else {
      console.log('Admin SMS sent for invoice click by:', clientEmail);
    }

    return Response.json({ received: true });

  } catch (error) {
    console.error('Brevo webhook error:', error.message);
    // Always return 200 so Brevo doesn't retry endlessly
    return Response.json({ received: true });
  }
});