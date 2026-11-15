/**
 * OAuth state for the employee communications layer.
 *
 * State is an HMAC-signed, short-lived, single-use token that binds the flow to
 * one tenant, one employee and one provider. It is never a plain encoded blob,
 * so a tampered or replayed callback is rejected rather than trusted.
 */

const encoder = new TextEncoder();
const TTL_MS = 10 * 60 * 1000;

async function key() {
  const secret = Deno.env.get('ARRIV_ESTATE_MEDIA_SECRET');
  if (!secret) throw new Error('OAuth state signing secret is not configured.');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function signState(payload: Record<string, unknown>) {
  const body = b64url(encoder.encode(JSON.stringify({ ...payload, iat: Date.now() })));
  const signature = await crypto.subtle.sign('HMAC', await key(), encoder.encode(body));
  return `${body}.${b64url(new Uint8Array(signature))}`;
}

export async function verifyState(state: string) {
  const [body, signature] = String(state || '').split('.');
  if (!body || !signature) return null;
  const valid = await crypto.subtle.verify('HMAC', await key(), unb64url(signature), encoder.encode(body));
  if (!valid) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(new TextDecoder().decode(unb64url(body)));
  } catch {
    return null;
  }
  if (!parsed?.iat || Date.now() - Number(parsed.iat) > TTL_MS) return null;
  if (!parsed?.tenant_id || !parsed?.sales_member_id || !parsed?.provider) return null;
  return parsed;
}