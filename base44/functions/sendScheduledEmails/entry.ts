import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { sendBrevoEmail, assertBrevoSendersActive, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';
import { reconcileEmailDeliveries } from '../../shared/queuedEmailDelivery.ts';
import { emailReceiptIds } from '../../shared/emailReceipts.ts';

// Only these two addresses are used as senders; anything else falls back to careers.
const ALLOWED_SENDERS = [BOOKINGS_SENDER_EMAIL, 'careers@arrivestatemedia.com'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(error => error.status === 401 ? null : Promise.reject(error));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { reconcile_only = false } = await req.json().catch(() => ({}));
    const delivery = await reconcileEmailDeliveries(base44, 'ScheduledEmail', 'error_message');
    if (reconcile_only) return Response.json({ success: delivery.lookup_errors === 0, provider: 'brevo', submitted: 0, ...delivery });
    const page = await base44.asServiceRole.entities.ScheduledEmail.filter(
      { status: 'pending', scheduled_for: { $lte: new Date().toISOString() }, provider_message_id: { $in: [null, ''] } },
      { sort: 'scheduled_for', limit: 20 }
    );
    const batch = page.items;
    const senderFor = email => ALLOWED_SENDERS.includes((email.from_email || '').toLowerCase()) ? email.from_email.toLowerCase() : 'careers@arrivestatemedia.com';
    if (batch.length) await assertBrevoSendersActive(batch.map(senderFor));
    const results = [];
    for (let offset = 0; offset < batch.length; offset += 6) {
      results.push(...await Promise.allSettled(batch.slice(offset, offset + 6).map(async (email) => {
        const knownReceipts = emailReceiptIds(email);
        if (knownReceipts.length) {
          await base44.asServiceRole.entities.ScheduledEmail.update(email.id, { status: 'submitted', provider_message_id: knownReceipts[0] });
          return;
        }
        const receipt = await sendBrevoEmail({
          to: email.to,
          subject: email.subject,
          textContent: email.body,
          senderName: email.from_name || undefined,
          senderEmail: senderFor(email),
        });
        await base44.asServiceRole.entities.ScheduledEmail.update(email.id, {
          status: 'submitted', provider_message_id: receipt.messageId, provider_message_ids: emailReceiptIds(email, receipt.messageId), submitted_at: new Date().toISOString(), error_message: '',
        });
      })));
    }

    let submitted = 0, failed = 0;
    await Promise.all(results.map(async (result, i) => {
      if (result.status === 'fulfilled') {
        submitted++;
      } else {
        failed++;
        await base44.asServiceRole.entities.ScheduledEmail.update(batch[i].id, {
          status: "failed",
          error_message: result.reason?.message || 'Unknown error'
        });
      }
    }));

    // Same cadence as the emails: flush any text that is due.
    let sms = null;
    try {
      const smsRes = await base44.asServiceRole.functions.invoke('sendScheduledSms', {});
      sms = smsRes?.data || smsRes;
    } catch (smsError) {
      console.error('Scheduled SMS run failed:', smsError.message);
    }

    return Response.json({ success: failed === 0, submitted, sent: delivery.delivered, failed: failed + delivery.failed, checked: batch.length, has_more: page.has_more, delivery_lookup_errors: delivery.lookup_errors, provider: 'brevo', sms });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}