/**
 * Cellphone sales dial-out: identity, extension parsing, destination policy and
 * TwiML for the rep's own IVR session.
 *
 * Separated from the function so the webhook handlers stay thin and so the same
 * parsing/policy rules can be unit reasoned about in one place.
 *
 * Security posture:
 *  - Only a registered, active cellphone may start a session (checked by caller
 *    number, never by anything the caller types).
 *  - The extension must belong to that same rep; it is an identifier, not a
 *    password, so it is never the only check.
 *  - Destinations are US/Canada only, NANP-valid, premium-rate blocked.
 */

export const DIAL_OUT_DEFAULTS = {
  menu_timeout: 8,
  entry_timeout: 12,
  retry_limit: 2,
  gather_finish_on_key: '#',
  max_attempts_per_session: 25,
};

const digits = (v: any) => String(v || '').replace(/\D/g, '');

export function normalizePhone(value: any) {
  const d = digits(value);
  if (!d) return '';
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return '';
}

const esc = (v: any) =>
  String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const xml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;

export function say(text: string, voice = 'Polly.Joanna') {
  return `<Say voice="${esc(voice)}">${esc(text)}</Say>`;
}

export function hangup() {
  return '<Hangup/>';
}

export function gather(action: string, text: string, options: any = {}) {
  const timeout = options.timeout || DIAL_OUT_DEFAULTS.menu_timeout;
  const finishOnKey = options.finishOnKey || DIAL_OUT_DEFAULTS.gather_finish_on_key;
  const numDigits = options.numDigits ? ` numDigits="${options.numDigits}"` : '';
  return `<Gather input="dtmf" action="${esc(action)}" method="POST" timeout="${timeout}" finishOnKey="${esc(finishOnKey)}"${numDigits}>${say(text, options.voice)}</Gather>`;
}

/**
 * Split "2043015550142" into extension + destination. Extensions are 2-4
 * digits, so the remainder is tried longest-first and must be a valid 10 or 11
 * digit US number.
 */
export function parseExtensionAndNumber(raw: any) {
  const all = digits(raw);
  if (all.length < 12) return { extension: '', destination: '', error: 'short' };
  for (const extLen of [4, 3, 2]) {
    if (all.length - extLen !== 10 && all.length - extLen !== 11) continue;
    const extension = all.slice(0, extLen);
    const destination = normalizePhone(all.slice(extLen));
    if (destination) return { extension, destination, error: '' };
  }
  return { extension: '', destination: '', error: 'unparsed' };
}

/** US/Canada only, valid NANP, no premium-rate, no N11 service codes. */
export function checkDestination(destination: string, settings: any) {
  if (!/^\+1\d{10}$/.test(destination || '')) {
    return 'Only US and Canada numbers can be dialed.';
  }
  const npa = destination.slice(2, 5);
  const nxx = destination.slice(5, 8);
  if (npa.startsWith('0') || npa.startsWith('1') || nxx.startsWith('0') || nxx.startsWith('1')) {
    return 'That number is not a valid phone number.';
  }
  if (npa === '900' || npa === '976' || npa === '800' || npa === '888' || npa === '877' || npa === '866' || npa === '855' || npa === '844' || npa === '833' || npa === '822') {
    if (settings?.premium_rate_blocked !== false) {
      return 'Premium and toll-free service numbers cannot be dialed from a sales line.';
    }
  }
  const n11 = ['211', '311', '411', '511', '611', '711', '811', '911'];
  if (n11.includes(npa + nxx.slice(0, 1))) {
    return 'Service numbers cannot be dialed.';
  }
  return null;
}

export async function resolveIdentity(base44: any, fromNumber: any) {
  const normalized = normalizePhone(fromNumber);
  if (!normalized) return null;
  const last10 = normalized.slice(-10);
  const rows = await base44.asServiceRole.entities.SalesPhoneIdentity.filter({}).catch(() => []);
  const list = Array.isArray(rows) ? rows : rows?.items || [];
  const identity = list.find((i: any) => digits(i.cellphone).slice(-10) === last10) || null;
  if (!identity) return null;
  const member = await base44.asServiceRole.entities.SalesTeamMember.get(identity.sales_member_id).catch(() => null);
  return { identity, member, normalized };
}

export function dialTwiml(options: any) {
  const {
    destination,
    callerId,
    actionUrl,
    statusCallbackUrl,
    timeoutSeconds,
    discloseUrl,
    record,
  } = options;
  const inner = `<Number url="${esc(discloseUrl)}" statusCallback="${esc(statusCallbackUrl)}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">${esc(destination)}</Number>`;
  return xml(
    `<Dial callerId="${esc(callerId)}" answerOnBridge="true" timeout="${Number(timeoutSeconds || 30)}" action="${esc(actionUrl)}" method="POST"${
      record ? ` record="${esc(record)}" recordingStatusCallback="${esc(options.recordingCallbackUrl || '')}" recordingStatusCallbackEvent="completed"` : ''
    }>${inner}</Dial>`
  );
}

export function withActionUrl(base: string, params: Record<string, string>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  return url.toString();
}

export const attemptIdFor = (callSid: string, index: number) =>
  `sat_${String(callSid || '').replace(/[^A-Za-z0-9]/g, '').slice(-18)}_${index}`;

export const sessionIdFor = (callSid: string) =>
  `sds_${String(callSid || '').replace(/[^A-Za-z0-9]/g, '').slice(-20)}`;