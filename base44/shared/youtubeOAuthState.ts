const MAX_STATE_AGE_MS = 20 * 60 * 1000;

async function stateKey(secret, usage) {
  if (!secret) throw new Error('YouTube OAuth signing secret is missing');
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage],
  );
}

export async function createYoutubeOAuthState(actor, secret, now = Date.now()) {
  const payload = `yt:${now}:${actor}`;
  const key = await stateKey(secret, 'sign');
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${hex}`;
}

export async function verifyYoutubeOAuthState(state, secret, now = Date.now()) {
  if (typeof state !== 'string' || !secret) return null;
  // Emails can contain many periods; only the LAST period separates the HMAC.
  // Retaining the original format also accepts valid links opened before this fix.
  const separator = state.lastIndexOf('.');
  if (separator < 1) return null;
  const payload = state.slice(0, separator);
  const signature = state.slice(separator + 1);
  if (!/^[a-f0-9]{64}$/.test(signature)) return null;

  const parts = /^yt:(\d+):(.+)$/.exec(payload);
  if (!parts) return null;
  const issuedAt = Number(parts[1]);
  const age = now - issuedAt;
  if (!Number.isSafeInteger(issuedAt) || age < 0 || age >= MAX_STATE_AGE_MS) return null;

  const bytes = Uint8Array.from(signature.match(/../g), (pair) => parseInt(pair, 16));
  const key = await stateKey(secret, 'verify');
  const valid = await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(payload));
  return valid ? { actor: parts[2], issuedAt } : null;
}