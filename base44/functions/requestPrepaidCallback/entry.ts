import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { requireCustomer } from '../../shared/customerSession.ts';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

/**
 * A customer asking a human to call them about a prepaid package.
 *
 * The request is recorded as a sales task and the Arriv team is emailed, so the request never depends
 * on a customer composing an email themselves. Nothing is charged and no wallet is touched here.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) return Response.json({ error: auth.error, code: auth.code }, { status: auth.status });

    const tier = body?.tier || {};
    const tierName = String(tier.name || '').slice(0, 60).trim();
    if (!tierName) return Response.json({ error: 'A package is required.' }, { status: 400 });

    const dollars = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const actor = auth.actor;
    const who = actor.full_name || actor.email;

    const summary =
      `Prepaid package request: ${tierName} — $${dollars(tier.price)} for ${tier.credits} credits and ` +
      `$${dollars(tier.booking_value)} of booking value, valid ${tier.validity || 'as published'}. ` +
      `Requested by ${who} (${actor.email}, ${actor.user_type === 'media_partner' ? 'media partner' : 'client'}). ` +
      `Call them to arrange it.`;

    // Sales task so the request is visible in the team's activity queue.
    await base44.asServiceRole.entities.ActivityLog.create({
      tenant_id: 'tnt_estate_media',
      activity_type: 'task',
      activity_date: new Date().toISOString(),
      contact_email: actor.email,
      contact_name: who,
      notes: summary,
    });

    const to = secrets.get('ADMIN_EMAIL') || 'bookings@arrivestatemedia.com';
    await sendBrevoEmail({
      to,
      subject: `Prepaid call back request — ${tierName} (${who})`,
      textContent: `${summary}\n\nReply to this customer from the Arriv console.`,
    });

    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'email',
      recipient_type: 'admin',
      recipient_email: to,
      message_content: summary,
      subject: `Prepaid call back request — ${tierName}`,
      status: 'success',
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}