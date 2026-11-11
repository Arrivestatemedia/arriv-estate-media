/**
 * Arriv Preferred — cancellation of a membership (server-side only).
 *
 * Two jobs, kept in one place so the concierge and the admin screen can never disagree:
 *
 *  1. Telling the advisor. When a customer asks the concierge to cancel, an email and a
 *     text go to the sales rep on file for that client. Nothing is cancelled by asking.
 *  2. Cancelling for real. An administrator cancels the membership here: the Stripe
 *     subscription is ended immediately and the record is marked cancelled, which is what
 *     removes Preferred access.
 */

import { sendBrevoEmail } from './brevoClient.ts';

export function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function env(key: string): string {
  try {
    return String(Deno.env.get(key) || '').trim();
  } catch {
    return '';
  }
}

export function appOrigin(): string {
  return env('BASE44_APP_DOMAIN') || 'https://app.arrivestatemedia.com';
}

/** The advisor on file: the membership's own originator, then an admin rep, then the owner. */
export function pickRep(members: any[], membership: any) {
  const wantedId = String(membership?.sales_originator_id || '').trim();
  const wantedEmail = String(membership?.sales_originator_email || '').trim().toLowerCase();
  const list = Array.isArray(members) ? members : [];
  let rep = wantedId ? list.find((member: any) => String(member?.id || '') === wantedId) || null : null;
  if (!rep && wantedEmail) {
    rep = list.find((member: any) => String(member?.email || '').trim().toLowerCase() === wantedEmail) || null;
  }
  if (!rep) {
    const active = list.filter((member: any) => member?.is_active !== false && String(member?.email || '').trim());
    rep = active.find((member: any) => member?.role === 'admin') || active[0] || null;
  }

  const email = String(rep?.email || rep?.company_email || '').trim() || env('ADMIN_EMAIL');
  const phone = String(rep?.phone_number || rep?.mobile_phone_number || '').trim()
    || env('OWNER_PHONE_NUMBER') || env('ADMIN_PHONE') || env('BRADLEY_PHONE');
  const name = String(rep?.full_name || membership?.sales_originator_name || '').trim() || 'your Arriv advisor';

  return { id: String(rep?.id || ''), name, email, phone, on_file: !!rep };
}

export async function resolveSalesRepForClient(base44: any, membership: any) {
  let members: any[] = [];
  try {
    members = rowsOf(await base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500));
  } catch {
    members = [];
  }
  return pickRep(members, membership);
}

async function sendTwilioSms({ to, body }: { to: string; body: string }) {
  const accountSid = env('TWILIO_ACCOUNT_SID');
  const authToken = env('TWILIO_AUTH_TOKEN');
  const from = env('TWILIO_PHONE_NUMBER');
  if (!to) return { sent: false, error: 'No phone number on file for the advisor.' };
  if (!accountSid || !authToken || !from) return { sent: false, error: 'Text messaging is not configured.' };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { sent: false, error: `Twilio returned ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}` };
    }
    return { sent: true, error: '' };
  } catch (error: any) {
    return { sent: false, error: String(error?.message || error) };
  }
}

function requestEmail(request: any, membership: any, rep: any) {
  const name = request.client_name || membership?.client_name || 'A Preferred member';
  const periodEnd = request.period_end ? new Date(request.period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'not recorded';
  const lines = [
    `${name} (${request.client_email}) asked the Arriv Concierge to cancel their Preferred membership.`,
    '',
    `Membership: ${request.plan || membership?.plan || 'Preferred'} · ${request.membership_status || membership?.status || 'active'}`,
    `Paid through: ${periodEnd}`,
    `Asked via: ${String(request.requested_via || '').replace(/_/g, ' ')}`,
  ];
  if (request.utterance) lines.push('', `What they said: "${request.utterance}"`);
  lines.push(
    '',
    'Nothing has been cancelled. Reach out to them to hear the reason.',
    `If they still want to cancel, cancel it from ${appOrigin()}/AdminPreferredMembers`,
  );
  return { subject: `Preferred cancellation request — ${name}`, body: lines.join('\n') };
}

/** Emails and texts the advisor. Returns exactly what was delivered. */
export async function notifySalesRepOfCancellation(base44: any, opts: { request: any; membership: any; rep: any }) {
  const { request, membership } = opts;
  const rep = opts.rep || await resolveSalesRepForClient(base44, membership);
  const { subject, body } = requestEmail(request, membership, rep);
  const errors: string[] = [];

  let emailSent = false;
  if (rep.email) {
    try {
      await sendBrevoEmail({ to: rep.email, subject, textContent: body });
      emailSent = true;
    } catch (error: any) {
      errors.push(`Email: ${String(error?.message || error)}`);
    }
  } else {
    errors.push('Email: no advisor address on file.');
  }

  const sms = await sendTwilioSms({
    to: rep.phone,
    body: `Arriv Preferred: ${request.client_name || request.client_email} asked to cancel. Nothing cancelled yet. Check your email.`,
  });
  if (!sms.sent) errors.push(`Text: ${sms.error}`);

  const now = new Date().toISOString();
  const patch: any = {
    sales_rep_id: rep.id,
    sales_rep_name: rep.name,
    sales_rep_email: rep.email,
    sales_rep_phone: rep.phone,
    notification_error: errors.join(' | '),
  };
  if (emailSent) patch.email_sent_at = now;
  if (sms.sent) patch.sms_sent_at = now;
  await base44.asServiceRole.entities.PreferredCancellationRequest.update(request.id, patch).catch(() => null);

  return { email: emailSent, sms: sms.sent, rep, errors };
}

/**
 * Ends a Preferred membership for real: the Stripe subscription is cancelled immediately and
 * the record is marked cancelled, which is what removes Preferred access.
 */
export async function cancelPreferredMembershipNow(base44: any, membership: any, opts: { actorEmail?: string; reason?: string } = {}) {
  const subscriptionId = String(membership?.stripe_subscription_id || '').trim();
  let stripeCancelled = false;
  let stripeError = '';

  if (subscriptionId) {
    const key = env('STRIPE_SECRET_KEY');
    if (!key) {
      stripeError = 'STRIPE_SECRET_KEY is not configured, so the Stripe subscription was not cancelled.';
    } else {
      try {
        const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(20000),
        });
        const payload = await res.json().catch(() => ({}));
        if (res.ok) stripeCancelled = true;
        else if (payload?.error?.code === 'resource_missing') stripeCancelled = true;
        else stripeError = payload?.error?.message || `Stripe returned ${res.status}`;
      } catch (error: any) {
        stripeError = String(error?.message || error);
      }
    }
  }

  const now = new Date().toISOString();
  const updated = await base44.asServiceRole.entities.PreferredMembership.update(membership.id, {
    status: 'canceled',
    cancelled_at: now,
    cancel_at_period_end: false,
    current_period_end: now,
  });

  const open = rowsOf(await base44.asServiceRole.entities.PreferredCancellationRequest
    .filter({ membership_id: membership.id, status: 'requested' }, { limit: 50 }).catch(() => []));
  for (const request of open) {
    await base44.asServiceRole.entities.PreferredCancellationRequest.update(request.id, {
      status: 'cancelled',
      handled_at: now,
      handled_by: String(opts.actorEmail || 'administrator'),
      handler_note: String(opts.reason || 'Membership cancelled by Arriv.'),
    }).catch(() => null);
  }

  return { membership: updated, subscription_id: subscriptionId, stripe_cancelled: stripeCancelled, stripe_error: stripeError };
}