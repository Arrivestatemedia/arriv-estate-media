/**
 * ARRIV ESTATE MEDIA — SMS delivery & engagement tracking (shared).
 *
 * One module for the whole tracking contract so the status callback, the send
 * path, the link redirect and the test harness all behave identically:
 *
 *   1. Delivery status ranks + failure explanations (never downgrade a message).
 *   2. Conservative reply attribution (never assume a reply answers the newest text).
 *   3. Link rewriting with an exclusion list (auth, payment/invoice, our own redirects).
 *   4. Click recording without storing IP addresses or raw user agents.
 *
 * Safety rules baked in here:
 *   - 'delivered' is only written from a Twilio delivery confirmation.
 *   - A tracked click is never presented as proof a message was read.
 *   - A message without links can never become "opened".
 */

export const APP_BASE_FALLBACK = 'https://arrivestatemedia.base44.app';

/** Public base URL of this app, used for callbacks and tracked links. */
export function appBaseUrl(): string {
  const domain = Deno.env.get('BASE44_APP_DOMAIN');
  return (domain ? domain.replace(/\/+$/, '') : APP_BASE_FALLBACK);
}

export function statusCallbackUrl(): string {
  return `${appBaseUrl()}/functions/twilioMessageStatusCallback`;
}

// ─────────────────────────────── delivery status ───────────────────────────────

/** Internal statuses in ascending order. A lower rank never overwrites a higher one. */
export const STATUS_RANK: Record<string, number> = {
  unset: 0,
  queued: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  undelivered: 5,
  failed: 5,
};

export function rankOf(status: string | null | undefined): number {
  return STATUS_RANK[String(status || '').toLowerCase()] ?? 0;
}

const FAILURE_REASONS: Record<string, string> = {
  '30001': 'The message could not be queued with the carrier.',
  '30003': 'The handset is unreachable or switched off.',
  '30004': 'The handset blocked this message.',
  '30005': 'The number is unknown or no longer in service.',
  '30006': 'That number cannot receive text messages (landline or unsupported carrier).',
  '30007': 'The carrier filtered this message as spam.',
  '30008': 'The handset reported an unknown delivery error.',
  '30011': 'That number is a landline.',
  '30012': 'This number has opted out and cannot be messaged again.',
  '21610': 'The recipient replied STOP and has opted out.',
  '21612': 'This number cannot receive messages from our sending number.',
  '21614': 'That number is not able to receive SMS.',
  '21408': 'Sending to this country or region is not enabled on the Twilio account.',
};

/** Plain-language explanation of a delivery failure, shown to the representative. */
export function friendlyFailureReason(code: string | null | undefined, status?: string): string {
  const key = String(code || '').trim();
  if (FAILURE_REASONS[key]) return FAILURE_REASONS[key];
  if (status === 'undelivered') return 'The carrier reported that this message could not be delivered.';
  if (status === 'failed') return 'Twilio could not send this message.';
  return '';
}

/**
 * Applies one delivery callback to the stored message.
 *
 * - Duplicate callbacks (same status, same error code) are ignored.
 * - Out-of-order callbacks are recorded in history but never downgrade the status.
 * - A confirmed 'delivered' is final and is never replaced by a later callback.
 */
export async function applyDeliveryStatus(
  base44: any,
  input: { sid: string; status: string; errorCode?: string; segments?: number },
): Promise<{ applied: boolean; status: string; reason: string }> {
  const sid = String(input.sid || '');
  const status = String(input.status || '').toLowerCase();
  if (!sid || !(status in STATUS_RANK) || status === 'unset') {
    return { applied: false, status: 'unset', reason: 'ignored_unknown_status' };
  }

  const rows = await base44.asServiceRole.entities.SmsMessage.filter({ twilio_sid: sid });
  const msg = rows && rows[0];
  if (!msg) return { applied: false, status: 'unset', reason: 'unknown_message' };

  const now = new Date().toISOString();
  const rank = rankOf(status);
  const errorCode = String(input.errorCode || '');
  const events = Array.isArray(msg.delivery_events) ? msg.delivery_events : [];
  const alreadySeen = events.some(
    (e: any) => e.status === status && String(e.error_code || '') === errorCode,
  );
  if (alreadySeen) return { applied: false, status: msg.status || 'unset', reason: 'duplicate_callback' };

  const history = [
    ...events,
    { status, rank, at: now, error_code: errorCode },
  ].slice(-20);

  const patch: any = { delivery_events: history, status_updated_at: now };
  if (Number.isFinite(input.segments) && Number(input.segments) > 0) {
    patch.segment_count = Number(input.segments);
  }

  const currentRank = Number.isFinite(msg.status_rank) ? msg.status_rank : rankOf(msg.status);
  const deliveredIsFinal = msg.status === 'delivered' && status !== 'delivered';
  const advances = !deliveredIsFinal && rank >= currentRank;

  if (advances) {
    patch.status = status;
    patch.status_rank = rank;
    if (status === 'sent') patch.sent_at = now;
    if (status === 'delivered') patch.delivered_at = now;
    if (status === 'failed' || status === 'undelivered') {
      patch.failed_at = now;
      patch.twilio_error_code = errorCode;
      patch.twilio_error_message = friendlyFailureReason(errorCode, status);
    }
  }

  await base44.asServiceRole.entities.SmsMessage.update(msg.id, patch);

  return {
    applied: advances,
    status: advances ? status : (msg.status || 'unset'),
    reason: alreadySeen
      ? 'duplicate_callback'
      : deliveredIsFinal
        ? 'delivered_is_final'
        : advances
          ? 'ok'
          : 'older_status_recorded_only',
  };
}

// ─────────────────────────────── reply attribution ───────────────────────────────

/** How long an outbound message stays eligible to be credited with a reply. */
export const REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Records an inbound reply.
 *
 * Conversation-level: the conversation is marked replied (with the timestamp) every time.
 * Message-level: an outbound message is credited only when exactly ONE outbound message
 * is waiting for an answer inside the reply window. If the representative sent several
 * texts since the last inbound, we cannot know which one was answered, so no message is
 * credited. A reply is never assumed to answer the newest outbound text.
 */
export async function recordInboundReply(
  base44: any,
  conversation: any,
  inbound: { messageId?: string; sid?: string; at?: string },
): Promise<{ attributed: boolean; message_id?: string; reason: string }> {
  if (!conversation?.id) return { attributed: false, reason: 'no_conversation' };
  const now = inbound?.at || new Date().toISOString();

  await base44.asServiceRole.entities.SmsConversation.update(conversation.id, {
    last_inbound_at: now,
    last_reply_at: now,
  });

  const page = await base44.asServiceRole.entities.SmsMessage.filter(
    { conversation_id: conversation.id },
    '-created_date',
    20,
  );
  const rows: any[] = Array.isArray(page) ? page : (page?.items || []);
  const history = rows.filter((m) => m.id !== inbound?.messageId);

  // The run of unanswered outbound messages immediately before this inbound one.
  const pending: any[] = [];
  for (const m of history) {
    if (m.direction !== 'outbound') break;
    pending.push(m);
  }
  if (pending.length !== 1) {
    return { attributed: false, reason: pending.length === 0 ? 'no_outbound_waiting' : 'several_outbound_waiting' };
  }

  const target = pending[0];
  const sentAt = target.sent_at || target.created_date;
  if (!sentAt || Date.now() - new Date(sentAt).getTime() > REPLY_WINDOW_MS) {
    return { attributed: false, reason: 'outside_reply_window' };
  }

  await base44.asServiceRole.entities.SmsMessage.update(target.id, {
    replied_at: now,
    reply_twilio_sid: inbound?.sid || '',
  });
  return { attributed: true, message_id: target.id, reason: 'ok' };
}

// ─────────────────────────────── link rewriting ───────────────────────────────

const URL_RE = /https?:\/\/[^\s<>"'()]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/**
 * Never rewritten: sign-in, password, verification, payment and billing links,
 * and our own redirects (rewriting them would add a hop or break a branded link).
 */
const EXCLUDED_URL = /(password|passwd|reset|verif|auth|login|log-?in|sign-?in|otp|magic|payment|invoice|checkout|stripe|billing|receipt|deposit|refund|paypal|venmo|cash\.app|squareup)/i;

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Whether this link may be rewritten for engagement tracking. */
export function shouldTrackLink(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  if (url.includes('/functions/smsLinkRedirect')) return false;
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.pathname.startsWith('/r/')) return false;
  const target = `${parsed.hostname}${parsed.pathname}${parsed.search}`;
  return !EXCLUDED_URL.test(target);
}

/** Human-readable destination description shown next to a click indicator. */
export function destinationLabel(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) return 'Link';
  const host = parsed.hostname.replace(/^www\./, '');
  if (/stripe\.com$/.test(host)) return 'Payment page';
  if (/drive\.google\.com$/.test(host)) return 'Google Drive link';
  if (/calendly\.com$/.test(host)) return 'Scheduling link';
  if (/arrivestatemedia\.com$/.test(host)) {
    const segment = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop();
    return segment ? `Arriv page (${segment})` : 'Arriv site';
  }
  const segment = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop();
  return segment ? `${host} (${segment})` : host;
}

function randomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 8);
}

export type TrackedLink = { code: string; target_url: string; label: string };

/**
 * Rewrites trackable links in an outbound conversation message.
 * Pure: nothing is written here, so the caller can persist the links only once the
 * message has really been sent.
 */
export function rewriteOutboundLinks(body: string): { body: string; links: TrackedLink[] } {
  const base = appBaseUrl();
  const seen = new Set<string>();
  const links: TrackedLink[] = [];

  const rewritten = String(body || '').replace(URL_RE, (raw: string) => {
    const url = raw.replace(TRAILING_PUNCTUATION, '');
    const trailing = raw.slice(url.length);
    if (!shouldTrackLink(url) || seen.has(url)) return raw;
    seen.add(url);
    const code = randomCode();
    links.push({ code, target_url: url, label: destinationLabel(url) });
    return `${base}/functions/smsLinkRedirect?c=${code}${trailing}`;
  });

  return { body: rewritten, links };
}

/** Stores the tracked links belonging to one sent message. */
export async function persistTrackedLinks(
  base44: any,
  links: TrackedLink[],
  meta: {
    messageId?: string;
    messageSid?: string;
    conversationId?: string;
    salesMemberId?: string;
    customerNumber?: string;
    now?: string;
  },
): Promise<void> {
  if (!links?.length) return;
  const now = meta.now || new Date().toISOString();
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  await base44.asServiceRole.entities.SmsTrackedLink.bulkCreate(
    links.map((l) => ({
      code: l.code,
      target_url: l.target_url,
      dest_label: l.label,
      message_id: meta.messageId || '',
      message_sid: meta.messageSid || '',
      conversation_id: meta.conversationId || '',
      sales_member_id: meta.salesMemberId || '',
      customer_number: meta.customerNumber || '',
      created_at: now,
      first_click_at: '',
      last_click_at: '',
      click_count: 0,
      human_click_count: 0,
      preview_count: 0,
      last_event_type: '',
      expires_at: expires,
    })),
  );
}

// ─────────────────────────────── click recording ───────────────────────────────

/**
 * Suspected automated access: link unfurlers, scanners and bot user agents.
 * Only the classification is ever stored — never the agent string.
 */
const AUTOMATED_AGENTS = [
  'bot', 'crawler', 'spider', 'preview', 'facebookexternalhit', 'whatsapp', 'telegram',
  'slack', 'discord', 'linkedin', 'googleimageproxy', 'yahoo', 'outlook', 'skypeuripreview',
  'embedly', 'pinterest', 'tumblr', 'curl', 'wget', 'python-requests', 'axios', 'okhttp',
  'headless', 'lighthouse', 'monitor', 'uptime', 'validator', 'scanner', 'proofpoint',
  'mimecast', 'barracuda', 'bingbot', 'applebot', 'googlebot', 'gptbot', 'ccbot',
];

export function classifyUserAgent(userAgent: string | null | undefined): 'human' | 'preview' | 'unknown' {
  const value = String(userAgent || '').toLowerCase().trim();
  if (!value) return 'unknown';
  if (AUTOMATED_AGENTS.some((a) => value.includes(a))) return 'preview';
  const looksLikeBrowser = /(mozilla|applewebkit|gecko|chrome|safari|firefox|edg|crios|fxios|samsungbrowser|opera)/.test(value);
  return looksLikeBrowser ? 'human' : 'unknown';
}

/**
 * Records one access of a tracked link against the link, its message and its
 * conversation. Runs before the redirect so the visitor never waits on it, and the
 * caller ignores failures: a broken redirect would be worse than an untracked click.
 */
export async function recordTrackedClick(
  base44: any,
  link: any,
  userAgent: string | null | undefined,
): Promise<{ category: string; click_count: number }> {
  const category = classifyUserAgent(userAgent);
  const now = new Date().toISOString();

  await base44.asServiceRole.entities.SmsTrackedLink.update(link.id, {
    click_count: (link.click_count || 0) + 1,
    human_click_count: (link.human_click_count || 0) + (category === 'human' ? 1 : 0),
    preview_count: (link.preview_count || 0) + (category === 'preview' ? 1 : 0),
    first_click_at: link.first_click_at || now,
    last_click_at: now,
    last_event_type: category,
  });

  if (link.message_id) {
    const rows = await base44.asServiceRole.entities.SmsMessage.filter({ id: link.message_id });
    const msg = rows && rows[0];
    if (msg) {
      const current = msg.link_engagement || {};
      await base44.asServiceRole.entities.SmsMessage.update(msg.id, {
        link_engagement: {
          click_count: (current.click_count || 0) + 1,
          human_click_count: (current.human_click_count || 0) + (category === 'human' ? 1 : 0),
          preview_count: (current.preview_count || 0) + (category === 'preview' ? 1 : 0),
          first_click_at: current.first_click_at || now,
          last_click_at: now,
          last_destination_label: link.dest_label || '',
          last_destination_url: link.target_url || '',
          last_event_type: category,
        },
      });

      if (msg.conversation_id) {
        const convos = await base44.asServiceRole.entities.SmsConversation.filter({ id: msg.conversation_id });
        const convo = convos && convos[0];
        if (convo) {
          await base44.asServiceRole.entities.SmsConversation.update(convo.id, {
            link_click_count: (convo.link_click_count || 0) + 1,
            last_link_click_at: now,
          });
        }
      }
    }
  }

  return { category, click_count: (link.click_count || 0) + 1 };
}