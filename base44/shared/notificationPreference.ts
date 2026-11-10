// Who may receive which kind of email.
//
// Two classes exist and they are never mixed:
//   * service — a required billing or account notice: payment failed, subscription activated or
//     cancelled, a seat change. It is part of the service the customer pays for.
//   * marketing — an optional message: the performance summary, a plan renewal reminder. It is only
//     ever sent when the switch is on AND the address has not opted out.
//
// The opt-out is stored per address in the app, and the unsubscribe link carries an HMAC token so the
// page can act on an address without ever putting it in a URL and without a login.

export const NOTICE_CLASS_SERVICE = "service";
export const NOTICE_CLASS_MARKETING = "marketing";

const TOKEN_SECRET_NAME = "ARRIV_ESTATE_MEDIA_SECRET";

export function normalizeEmail(value: any): string {
  return String(value || "").trim().toLowerCase();
}

function secret(): string {
  const value = String((globalThis as any)?.process?.env?.[TOKEN_SECRET_NAME] || "");
  if (!value) throw new Error("The notification signing secret is not configured.");
  return value;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

// The token is the address plus its signature. It is unguessable, carries nothing else, and cannot be
// edited to reach another address.
export async function preferenceToken(email: string): Promise<string> {
  const address = normalizeEmail(email);
  if (!address) return "";
  const encoded = base64UrlEncode(new TextEncoder().encode(address));
  return `${encoded}.${await sign(address)}`;
}

export async function emailFromToken(token: string): Promise<string> {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "";
  let address = "";
  try {
    address = new TextDecoder().decode(base64UrlDecode(parts[0]));
  } catch {
    return "";
  }
  if (!address.includes("@")) return "";
  const expected = await sign(address);
  if (expected.length !== parts[1].length) return "";
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ parts[1].charCodeAt(i);
  }
  return mismatch === 0 ? address : "";
}

// A stored preference. Absent means "not opted out": opting out is the only thing that has to be
// recorded, and an address that never opted out keeps receiving both classes while the switch is on.
export async function loadPreference(base44: any, email: string): Promise<any | null> {
  const address = normalizeEmail(email);
  if (!address) return null;
  const result = await base44.asServiceRole.entities.NotificationPreference.filter({ email: address }, { limit: 1 });
  const rows = Array.isArray(result) ? result : result?.items || [];
  return rows[0] || null;
}

export async function marketingAllowed(base44: any, email: string): Promise<boolean> {
  const record = await loadPreference(base44, email);
  return record?.marketing_opt_out !== true;
}

export async function recordPreference(base44: any, email: string, patch: any): Promise<any> {
  const address = normalizeEmail(email);
  if (!address) throw new Error("An email address is required.");
  const existing = await loadPreference(base44, address);
  const now = new Date().toISOString();
  const payload = {
    email: address,
    ...patch,
    last_event_at: now,
    updated_at: now,
  };
  if (existing) {
    return base44.asServiceRole.entities.NotificationPreference.update(existing.id, payload);
  }
  return base44.asServiceRole.entities.NotificationPreference.create({ ...payload, created_at: now });
}

// The single decision a sender consults before it writes an email.
export function noticeAllowed(noticeClass: string, context: { switchOn: boolean; marketingAllowed: boolean }): boolean {
  if (!context?.switchOn) return false;
  if (noticeClass === NOTICE_CLASS_MARKETING) return context.marketingAllowed === true;
  return true;
}

export function noticeClassOf(notice: any): string {
  return String(notice?.notice_class || NOTICE_CLASS_MARKETING) === NOTICE_CLASS_SERVICE
    ? NOTICE_CLASS_SERVICE
    : NOTICE_CLASS_MARKETING;
}