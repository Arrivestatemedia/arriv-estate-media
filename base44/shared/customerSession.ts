import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

/**
 * Customer session layer for the EXISTING Arriv Estate Media custom login.
 *
 * This does not replace, extend or migrate authentication. verifySignIn keeps
 * verifying the same PendingSignup password with the same PBKDF2 hash; the only
 * addition is that a successful password check also mints a signed, expiring
 * session token so backend functions can authorise on a server-verifiable
 * credential instead of a browser-supplied email.
 *
 * Fail-closed rules:
 *  - No CUSTOMER_SESSION_SECRET set => no token is minted. Sign-in still works
 *    exactly as before; enforcement (requireCustomer) refuses every request.
 *  - requireCustomer always re-reads the account and compares session_epoch, so
 *    bumping that field revokes every outstanding session for that account.
 */

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, mobile contractors in the field

export type CustomerActor = {
  account_id: string;
  email: string;
  full_name: string;
  user_type: string;
  role: 'admin' | 'user';
  session_epoch: number;
};

export type CustomerAuth =
  | { ok: true; actor: CustomerActor }
  | { ok: false; status: number; error: string };

function sessionSecret(): string {
  return Deno.env.get('CUSTOMER_SESSION_SECRET') || '';
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/** Mint a session for a verified PendingSignup account. Returns null when no secret is configured. */
export function mintCustomerSession(account: any): { token: string; expires_at: string } | null {
  const secret = sessionSecret();
  if (!secret || !account?.id || !account?.email) return null;

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    sub: account.id,
    email: String(account.email).toLowerCase(),
    name: account.full_name || '',
    ut: account.user_type || 'client',
    role: account.user_role === 'admin' ? 'admin' : 'user',
    ep: Number(account.session_epoch || 0),
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  };

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return {
    token: `${body}.${sign(body, secret)}`,
    expires_at: new Date((issuedAt + SESSION_TTL_SECONDS) * 1000).toISOString(),
  };
}

/** Verify signature and expiry. Returns the payload or null. */
export function verifyCustomerSession(token: string | null | undefined): any | null {
  const secret = sessionSecret();
  if (!secret || !token || typeof token !== 'string') return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const provided = Buffer.from(signature);
  const expected = Buffer.from(sign(body, secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.sub || !payload?.email) return null;
    if (Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Token arrives in the JSON body (SDK invoke) or as a Bearer header. */
export function readSessionToken(req: Request, body: any): string | null {
  if (body && typeof body.session_token === 'string' && body.session_token) return body.session_token;
  const header = req.headers.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Authorise the caller from the session token only. The browser-supplied email,
 * account id or role is never read here — those are re-derived from the record.
 */
export async function requireCustomer(base44: any, req: Request, body: any): Promise<CustomerAuth> {
  const payload = verifyCustomerSession(readSessionToken(req, body));
  if (!payload) {
    return { ok: false, status: 401, error: 'A valid session is required. Please sign in again.' };
  }

  let record: any = null;
  try {
    record = await base44.asServiceRole.entities.PendingSignup.get(payload.sub);
  } catch {
    record = null;
  }

  if (!record) {
    return { ok: false, status: 401, error: 'Your account could not be found. Please sign in again.' };
  }
  if (Number(record.session_epoch || 0) !== Number(payload.ep || 0)) {
    return { ok: false, status: 401, error: 'Your session has ended. Please sign in again.' };
  }

  return {
    ok: true,
    actor: {
      account_id: record.id,
      email: String(record.email || '').toLowerCase(),
      full_name: record.full_name || '',
      user_type: record.user_type || 'client',
      role: record.user_role === 'admin' ? 'admin' : 'user',
      session_epoch: Number(record.session_epoch || 0),
    },
  };
}

/** True when the record belongs to the signed-in account (server-side ownership check). */
export function ownsEmail(actor: CustomerActor, email: string | null | undefined): boolean {
  if (!email) return false;
  return String(email).trim().toLowerCase() === actor.email;
}