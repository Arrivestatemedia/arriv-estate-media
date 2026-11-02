import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';

/**
 * trackInvoiceEngagement
 * Records that a client opened an invoice link from their portal and texts the
 * owner about it.
 *
 * Auth: clients hold a localStorage session (PendingSignup), not a Base44
 * session, so ownership is verified by matching the supplied email to the
 * invoice's client_email — the same pattern as getClientInvoices.
 *
 * Repeated taps are still recorded, but only one text is sent per invoice
 * action inside a 10-minute window.
 */
const ACTION_LABELS = {
  pay: 'pay link',
  view_invoice: 'invoice',
  view_receipt: 'receipt',
};

const NOTIFY_WINDOW_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceId, action, clientEmail } = await req.json().catch(() => ({}));

    if (!invoiceId || !clientEmail) {
      return Response.json({ error: 'invoiceId and clientEmail are required' }, { status: 400 });
    }

    const invoice = await base44.asServiceRole.entities.Invoice.get(invoiceId);
    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if ((invoice.client_email || '').toLowerCase() !== String(clientEmail).trim().toLowerCase()) {
      return Response.json({ error: 'Unauthorized: this invoice does not belong to you' }, { status: 403 });
    }

    const normalizedAction = ACTION_LABELS[action] ? action : 'view_invoice';
    const clickedAt = new Date().toISOString();

    const recentRaw = await base44.asServiceRole.entities.InvoiceEngagement.filter(
      { invoice_id: invoice.id, action: normalizedAction },
      { sort: '-clicked_at', limit: 5 }
    );
    const recent = Array.isArray(recentRaw) ? recentRaw : (recentRaw?.items || []);
    const alreadyNotified = recent.some(
      (row) => new Date(row.clicked_at || 0).getTime() > Date.now() - NOTIFY_WINDOW_MS
    );

    const engagement = await base44.asServiceRole.entities.InvoiceEngagement.create({
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number || '',
      invoice_type: invoice.invoice_type || '',
      client_email: invoice.client_email,
      client_name: invoice.client_name || '',
      job_address: invoice.job_address || '',
      amount: invoice.amount || 0,
      action: normalizedAction,
      clicked_at: clickedAt,
      sms_sent: false,
    });

    let smsSent = false;
    let smsRecipient = '';

    const ownerPhone =
      Deno.env.get('OWNER_PHONE_NUMBER') ||
      Deno.env.get('BRADLEY_PHONE') ||
      Deno.env.get('ADMIN_PHONE');
    const from = Deno.env.get('TWILIO_PHONE_NUMBER');
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    // Receipts are paid business — log the open, never text about it.
    const notifyAllowed = normalizedAction !== 'view_receipt';

    if (notifyAllowed && !alreadyNotified && ownerPhone && from && accountSid && authToken) {
      const when = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      const num = invoice.invoice_number ? `#${invoice.invoice_number} ` : '';
      const amt = invoice.amount ? `$${invoice.amount} ` : '';
      const who = invoice.client_name || invoice.client_email;
      const where = invoice.job_address ? ` for ${invoice.job_address}` : '';
      const body = `Invoice ${num}${amt}- ${who} tapped the ${ACTION_LABELS[normalizedAction]}${where}. ${when}`;

      try {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ From: from, To: ownerPhone, Body: body }).toString(),
          }
        );
        smsSent = res.ok;
        if (res.ok) smsRecipient = ownerPhone;
        else console.error('Invoice click SMS failed:', res.status, await res.text());
      } catch (smsError) {
        console.error('Invoice click SMS failed:', smsError.message);
      }

      if (smsSent) {
        await base44.asServiceRole.entities.InvoiceEngagement.update(engagement.id, {
          sms_sent: true,
          sms_recipient: smsRecipient,
        });
      }
    }

    return Response.json({ success: true, action: normalizedAction, sms_sent: smsSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});