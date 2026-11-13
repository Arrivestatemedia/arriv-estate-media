/**
 * Phone number normalisation for the call center.
 *
 * Every caller is compared in E.164 form so a number stored as "(678) 242-9107",
 * "6782429107" or "+16782429107" is recognised as the same person. Nothing here
 * decides permissions — it only makes matching reliable.
 */

export function digitsOnly(value: any): string {
  return String(value || '').replace(/\D/g, '');
}

/** Normalise to E.164 (+1XXXXXXXXXX) when it is a usable US number, else ''. */
export function normalizeE164(value: any): string {
  const digits = digitsOnly(value);
  if (!digits) return '';
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length > 11) return '+' + digits;
  return '';
}

/** Every shape a stored number might take, for a single $in lookup. */
export function numberVariants(value: any): string[] {
  const e164 = normalizeE164(value);
  if (!e164) return [];
  const ten = e164.slice(-10);
  return [...new Set([e164, ten, '+1' + ten])];
}

export function sameNumber(a: any, b: any): boolean {
  const left = normalizeE164(a);
  return !!left && left === normalizeE164(b);
}

/** Twilio requires a leading + for outbound dialling. */
export function dialable(value: any): string {
  const e164 = normalizeE164(value);
  if (e164) return e164;
  const raw = String(value || '').trim();
  return raw.startsWith('+') ? raw : '';
}

export function firstName(full: any): string {
  const name = String(full || '').trim();
  if (!name) return '';
  return name.split(/\s+/)[0];
}

export function displayNumber(value: any): string {
  const e164 = normalizeE164(value);
  if (!e164) return String(value || '');
  const ten = e164.slice(-10);
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** Stable, non-reversible key so the same event is never recorded twice. */
export async function dedupeHash(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}