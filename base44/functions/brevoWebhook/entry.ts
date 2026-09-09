import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { auditLog } from '../../shared/securityAudit.ts';

/**
 * Brevo webhook handler.
 *
 * Round 1 found NO authentication on this webhook.
 * Brevo does not provide a native webhook signature mechanism like Twilio,
 * so we verify using a shared secret passed in the X-Brevo-Webhook-Secret header.
 *
 * The secret must be configured in Brevo's webhook settings as a custom header
 * and stored in the app secrets as BREVO_WEBHOOK_SECRET.
 *
 * If the secret is not configured, the webhook rejects all requests (fail-secure).
 */
async function verifyBrevoSignature(req: Request): Promise<boolean> {
  const expectedSecret = Deno.env.get('BREVO_WEBHOOK_SECRET');
  if (!expectedSecret) {
    // Fail-secure: if no secret is configured, reject all requests
    return false;
  }
  const providedSecret = req.headers.get('X-Brevo-Webhook-Secret') || '';
  if (!providedSecret) return false;

  // Constant-time comparison
  if (expectedSecret.length !== providedSecret.length) return false;
  let result = 0;
  for (let i = 0; i < expectedSecret.length; i++) {
    result |= expectedSecret.charCodeAt(i) ^ providedSecret.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    // ── Brevo webhook authentication ──
    const signatureValid = await verifyBrevoSignature(req);
    if (!signatureValid) {
      await auditLog(base44, req, {
        event_type: 'webhook_verification_failure',
        actor_type: 'webhook',
        action: 'brevoWebhook',
        result: 'denied',
        reason: 'invalid_brevo_secret',
      });
      // Return 200 so Brevo doesn't retry endlessly, but don't process
      return Response.json({ received: true });
    }

    const event = await req.json();

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
        const invoice = invoices[0];
        invoiceInfo = `\nProperty: ${invoice.job_address}\nAmount: $${invoice.amount ? invoice.amount.toFixed(2) : '—'}`;

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