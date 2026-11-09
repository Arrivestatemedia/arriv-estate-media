// brightMediaUrls.ts
// Signed, expiring, single-file media links for the Bright Media Sync.
//
// Bright fetches photographs from its own servers, with no Arriv session and no Google credentials,
// so each photograph needs a URL that:
//   * is unguessable — a forged or edited token is rejected;
//   * expires — a leaked URL stops working;
//   * names exactly one file in exactly one request, so it can never be widened to a folder;
//   * reveals nothing about Drive. The Drive file id travels inside the signed token and is only
//     ever resolved server-side; the delivery folder id never appears in a URL.
//
// The token is an HMAC over its own payload, keyed by BRIGHT_MLS_MEDIA_SIGNING_SECRET, so this
// module can both mint and verify it without storing anything.

const encoder = new TextEncoder();

/** How long a media link stays usable. Bright fetches during the agent's import, usually same day. */
export const BRIGHT_MEDIA_URL_TTL_HOURS = 24 * 14;

export interface BrightMediaTokenPayload {
  requestId: string;
  fileId: string;
  expiresAt: number;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  const binary = atob(padding ? padded + "=".repeat(4 - padding) : padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64url(new Uint8Array(mac));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mints the opaque token that authorizes reads of one file inside one request. */
export async function signBrightMediaToken(payload: BrightMediaTokenPayload, secret: string): Promise<string> {
  if (!secret) throw new Error("Media signing secret is not configured");
  const claims = { r: payload.requestId, f: payload.fileId, e: payload.expiresAt };
  const body = base64url(encoder.encode(JSON.stringify(claims)));
  return `${body}.${await sign(secret, body)}`;
}

export async function verifyBrightMediaToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<{ valid: boolean; reason?: string; requestId?: string; fileId?: string; expiresAt?: number }> {
  if (!secret) return { valid: false, reason: "Media links are not configured" };
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return { valid: false, reason: "Malformed media link" };

  const expected = await sign(secret, body);
  if (!timingSafeEqual(expected, mac)) return { valid: false, reason: "Media link is not valid" };

  let claims: any;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
  } catch {
    return { valid: false, reason: "Malformed media link" };
  }
  if (!claims?.r || !claims?.f) return { valid: false, reason: "Malformed media link" };
  if (!(Number(claims.e) > now)) return { valid: false, reason: "This media link has expired" };

  return {
    valid: true,
    requestId: String(claims.r),
    fileId: String(claims.f),
    expiresAt: Number(claims.e),
  };
}

/** The URL Bright fetches. It carries only the opaque token — never a Drive id, path or folder. */
export function buildBrightMediaUrl(origin: string, token: string): string {
  const base = String(origin || "").replace(/\/+$/, "");
  return `${base}/functions/serveBrightMedia?t=${encodeURIComponent(token)}`;
}

export function brightMediaExpiry(now: number = Date.now()): number {
  return now + BRIGHT_MEDIA_URL_TTL_HOURS * 60 * 60 * 1000;
}