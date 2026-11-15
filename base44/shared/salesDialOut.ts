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

import { say as sharedSay, speakable } from './ivr.ts';
import { ivrVoiceReady, ivrVoiceUrl } from './ivrVoice.ts';

export const DIAL_OUT_DEFAULTS = {
  menu_timeout: 8,
  /**
   * Inter-digit timeout for the extension + destination entry.
   *
   * This is Twilio's pause after the LAST key pressed, not the whole entry
   * window: a partner types 13 digits and then waits this long before the
   * digits are submitted. At 12s that read as a dead line, so it is short
   * enough to feel immediate while still allowing a deliberate, unhurried
   * entry. Pressing pound submits instantly at any point.
   */
  entry_timeout: 4,
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

/**
 * Spoken output for the Media Partner dial-out IVR.
 *
 * Every prompt goes through the same Arriv ElevenLabs voice the main business
 * line uses, so a partner never hears a different voice on their own line. The
 * shared helper falls back to Twilio speech when no generated audio is
 * available, so a voice failure is never silence.
 */
export function say(text: string, voice = 'Polly.Joanna') {
  return sharedSay(text, voice);
}

export function hangup() {
  return '<Hangup/>';
}

/**
 * Generate the next prompt's audio BEFORE it is needed.
 *
 * ivrVoice only caches a line the first time Twilio fetches it, so the first
 * caller after a cold start pays for the ElevenLabs round trip while hearing
 * silence. Warming the line the caller is about to need — while the current
 * menu is still playing — moves that work into time nobody is waiting on.
 * The voice, text and signature are unchanged; this only fills the cache.
 */
export function warmVoice(base: string, texts: any[]) {
  if (!ivrVoiceReady()) return;
  const run = async () => {
    for (const text of texts) {
      if (!text) continue;
      await fetch(ivrVoiceUrl(base, speakable(text))).catch(() => {});
    }
  };
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(run());
  else run().catch(() => {});
}

export function gather(action: string, text: string, options: any = {}) {
  const timeout = options.timeout || DIAL_OUT_DEFAULTS.menu_timeout;
  const finishOnKey = options.finishOnKey || DIAL_OUT_DEFAULTS.gather_finish_on_key;
  const numDigits = options.numDigits ? ` numDigits="${options.numDigits}"` : '';
  return `<Gather input="dtmf" action="${esc(action)}" method="POST" timeout="${timeout}" finishOnKey="${esc(finishOnKey)}"${numDigits}>${say(text, options.voice)}</Gather>`;
}

/**
 * Accepted keypad entry, in order:
 *
 *   1. extension then number as ONE continuous string  →  1015551234567
 *      (13 digits: 3-digit extension + 10-digit number), or press # to submit
 *      immediately instead of waiting out the inter-digit pause.
 *   2. the destination alone                           →  5551234567
 *      (10 digits, or 11 with a leading 1). The extension is implied because
 *      the caller has already been identified by their own registered
 *      cellphone on their own assigned line.
 *
 * Extensions are 2-4 digits, so a combined entry is tried longest-first and
 * the remainder must be a valid 10 or 11 digit US/Canada number.
 */
export function parseExtensionAndNumber(raw: any) {
  const all = digits(raw);
  // Destination only — the caller is already authenticated by caller ID.
  const alone = normalizePhone(all);
  if (all.length === 10 || (all.length === 11 && all.startsWith('1'))) {
    if (alone) return { extension: '', destination: alone, error: '' };
  }
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
  const inner = `<Number${discloseUrl ? ` url="${esc(discloseUrl)}"` : ''} statusCallback="${esc(statusCallbackUrl)}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">${esc(destination)}</Number>`;
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

/**
 * The individual Media Partner line a session is being started on.
 *
 * A partner may only ever dial out from their OWN assigned business number: the
 * number dialed, the number stored on the employee account and the caller ID on
 * their telephony identity must all be the same, and it may never be a shared
 * company line. Returns a plain reason when the line is not theirs.
 */
export function checkDialOutLine(line: any, member: any, identity: any) {
  const dialed = normalizePhone(line);
  if (!dialed) return 'This line is not a Media Partner line.';
  if (dialed === '+18557654306') return 'The 855 number is the main company line, not a Media Partner line.';
  const owned = normalizePhone(member?.twilio_phone_number);
  const callerId = normalizePhone(identity?.caller_id_number);
  if (!owned || owned !== dialed) return 'This number is not assigned to you.';
  if (!callerId || callerId !== dialed) return 'This line is not linked to your telephony identity.';
  return null;
}

/** The company lines that must never expose a personal sales menu. */
export const COMPANY_LINES = ['+18557654306', '+17069128967'];

export const attemptIdFor = (callSid: string, index: number) =>
  `sat_${String(callSid || '').replace(/[^A-Za-z0-9]/g, '').slice(-18)}_${index}`;

export const sessionIdFor = (callSid: string) =>
  `sds_${String(callSid || '').replace(/[^A-Za-z0-9]/g, '').slice(-20)}`;