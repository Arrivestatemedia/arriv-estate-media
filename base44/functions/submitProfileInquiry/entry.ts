import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { rowsOf, jsonResponse, CORS_HEADERS } from '../../shared/visibilityActor.ts';
import { isPubliclyVisible } from '../../shared/professionalProfile.ts';
import {
  normalizeInquiryInput,
  validateInquiry,
  assessSpam,
  statusForSpam,
  routeInquiry,
  inquiryConsentText,
  inquiryDisclosures,
  inquiryEmailBody,
  channelFrom,
} from '../../shared/profileInquiry.ts';
import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';

async function hashValue(value: string): Promise<string> {
  const salt = String(secrets.get('ESTATE_MEDIA_SECRET') || 'arriv-visibility');
  const data = new TextEncoder().encode(`${salt}|${value}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function clientIp(req: Request): string {
  const forwarded = String(req.headers.get('x-forwarded-for') || '');
  return forwarded.split(',')[0].trim() || String(req.headers.get('cf-connecting-ip') || '');
}

function sourceLabel(sourceType: string): string {
  if (sourceType === 'brokerage_profile') return 'a brokerage profile';
  if (sourceType === 'geo_page') return 'a local property page';
  return 'an agent profile';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400);
  }

  try {
    const base44 = createClientFromRequest(req);
    const input = normalizeInquiryInput(body);

    const profileType = String(body?.profile_type || 'agent') === 'brokerage' ? 'brokerage' : 'agent';
    const slug = String(body?.slug || '').trim().toLowerCase();
    if (!slug) return jsonResponse({ ok: false, error: 'Missing profile.' }, 400);

    const found = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_type: profileType, slug }));
    const profile = found[0];
    // An unpublished, unauthorized or unapproved profile cannot receive inquiries, and its existence
    // is not disclosed to the sender.
    if (!profile || !isPubliclyVisible(profile)) {
      return jsonResponse({ ok: false, error: 'That profile is not available.' }, 404);
    }

    const errors = validateInquiry(input);
    if (errors.length) return jsonResponse({ ok: false, error: errors[0], errors }, 400);

    const routing = routeInquiry(profile);
    if (!routing.ok) {
      return jsonResponse({ ok: false, error: 'This profile cannot receive inquiries right now.' }, 409);
    }

    const ipHash = await hashValue(clientIp(req) || 'unknown');
    const uaHash = await hashValue(String(req.headers.get('user-agent') || 'unknown'));

    const since = new Date(Date.now() - 3600000).toISOString();
    const [byEmail, byIp] = await Promise.all([
      base44.asServiceRole.entities.ProfileInquiry.filter({ email: input.email, created_at: { $gte: since } }, { limit: 10 }),
      base44.asServiceRole.entities.ProfileInquiry.filter({ ip_hash: ipHash, created_at: { $gte: since } }, { limit: 20 }),
    ]);

    const spam = assessSpam(input, { recentFromEmail: rowsOf(byEmail).length, recentFromIp: rowsOf(byIp).length });
    const status = statusForSpam(spam.score);

    if (status === 'rejected_spam') {
      // Recorded for abuse review, but nothing is delivered and nothing is claimed to the sender.
      await base44.asServiceRole.entities.ProfileInquiry.create({
        inquiry_id: `pinq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        source_type: 'agent_profile',
        profile_id: profile.profile_id,
        profile_type: profile.profile_type,
        public_slug: profile.slug,
        name: input.name,
        email: input.email,
        message: input.message,
        consent_privacy: input.consent_privacy,
        consent_text_snapshot: inquiryConsentText(profile.display_name),
        consent_at: new Date().toISOString(),
        disclosures: inquiryDisclosures(profile.profile_type),
        status: 'rejected_spam',
        notification_status: 'recorded',
        spam_score: spam.score,
        spam_flags: spam.flags,
        ip_hash: ipHash,
        user_agent_hash: uaHash,
        created_at: new Date().toISOString(),
      });
      return jsonResponse({ ok: true, received: true });
    }

    const utm = {
      utm_source: String(body?.utm_source || '').slice(0, 120),
      utm_medium: String(body?.utm_medium || '').slice(0, 120),
      utm_campaign: String(body?.utm_campaign || '').slice(0, 120),
    };
    const referrerHost = String(body?.referrer_host || '').slice(0, 200);

    const inquiry = await base44.asServiceRole.entities.ProfileInquiry.create({
      inquiry_id: `pinq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      source_type: profile.profile_type === 'brokerage' ? 'brokerage_profile' : 'agent_profile',
      profile_id: profile.profile_id,
      profile_type: profile.profile_type,
      public_slug: profile.slug,
      market_slug: String(body?.market_slug || '').slice(0, 120),
      listing_id: String(body?.listing_id || '').slice(0, 120),
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
      consent_privacy: input.consent_privacy,
      consent_text_snapshot: inquiryConsentText(profile.display_name),
      consent_at: new Date().toISOString(),
      disclosures: inquiryDisclosures(profile.profile_type),
      routed_to_email: routing.routed_to_email,
      routing_mode: routing.routing_mode,
      routing_reason: routing.routing_reason,
      channel: channelFrom(utm, referrerHost),
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      referrer_host: referrerHost,
      landing_page: String(body?.landing_page || '').split('?')[0].slice(0, 300),
      ip_hash: ipHash,
      user_agent_hash: uaHash,
      spam_score: spam.score,
      spam_flags: spam.flags,
      status: status === 'review' ? 'review' : 'routed',
      notification_status: 'pending_recipient_delivery',
      delivery_attempts: 0,
      created_at: new Date().toISOString(),
    });

    // The record exists before any send is attempted, so a failure never loses the lead.
    const { subject, text } = inquiryEmailBody({
      profile,
      inquiry: input,
      sourceLabel: sourceLabel(inquiry.source_type),
    });

    let notificationStatus = 'delivered';
    let deliveryError = '';
    let messageId = '';
    try {
      const sent = await sendBrevoEmail({
        to: routing.routed_to_email,
        subject,
        textContent: text,
        senderEmail: BOOKINGS_SENDER_EMAIL,
        senderName: 'Arriv Estate Media',
        replyTo: input.email,
      });
      messageId = String(sent?.messageId || '');
    } catch (error) {
      notificationStatus = 'failed';
      deliveryError = String(error?.message || error).slice(0, 400);
    }

    await base44.asServiceRole.entities.ProfileInquiry.update(inquiry.id, {
      notification_status: notificationStatus,
      delivery_attempts: 1,
      last_delivery_attempt_at: new Date().toISOString(),
      delivered_at: notificationStatus === 'delivered' ? new Date().toISOString() : undefined,
      delivery_message_id: messageId || undefined,
      delivery_error: deliveryError || undefined,
      next_delivery_attempt_at: notificationStatus === 'delivered'
        ? undefined
        : new Date(Date.now() + 10 * 60000).toISOString(),
    });

    return jsonResponse({
      ok: true,
      received: true,
      routed: notificationStatus === 'delivered' ? 'delivered' : 'recorded',
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});