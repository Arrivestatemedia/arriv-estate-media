import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { secrets } from 'base44:runtime';

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
 *  - No CUSTOMER_SESSION_SECRET set => sign-in fails explicitly with 503;
 *    it must never report success without issuing a usable credential.
 *  - requireCustomer always re-reads the account and compares session_epoch, so
 *    bumping that field revokes every outstanding session for that account.
 */

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, mobile contractors in the field

export type CustomerActor = {
  account_id: string;
  account_source: 'pending' | 'user';
  email: string;
  full_name: string;
  user_type: string;
  role: 'admin' | 'user';
  session_epoch: number;
};

export type CustomerAuth =
  | { ok: true; actor: CustomerActor; record: any }
  | { ok: false; status: number; error: string; code?: string };

function sessionSecret(): string {
  return secrets.get('CUSTOMER_SESSION_SECRET') || '';
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/** Both credential branches use this exact signer and the same response contract. */
export function mintCustomerSession(account: any, source: 'pending' | 'user' = 'pending') {
  const secret = sessionSecret();
  if (!secret || !account?.id || !account?.email) return null;

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    sub: account.id,
    src: source,
    email: String(account.email).trim().toLowerCase(),
    name: account.full_name || '',
    ut: account.user_type || 'client',
    role: account.user_role === 'admin' ? 'admin' : 'user',
    ep: Number(account.session_epoch || 0),
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  };

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const token = `${body}.${sign(body, secret)}`;
  const expiresAt = new Date(payload.exp * 1000).toISOString();
  return {
    session_token: token,
    session_expires_at: expiresAt,
    session_contract: 'customer-v1',
    // Retain the original names for older callers; the credential itself is unchanged.
    token,
    expires_at: expiresAt,
  };
}

/** Verify signature and expiry. Returns the payload or null. */
export function verifyCustomerSession(token: string | null | undefined): any | null {
  const secret = sessionSecret();
  if (!secret || !token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const provided = Buffer.from(signature);
  const expected = Buffer.from(sign(body, secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.sub || !payload?.email) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (payload.src && !['pending', 'user'].includes(payload.src)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Token arrives in the JSON body (SDK invoke) or as a Bearer header. */
export function readSessionToken(req: Request, body: any): string | null {
  if (body && typeof body.session_token === 'string' && body.session_token) return body.session_token;
  const header = req?.headers?.get?.('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Authorise the caller from the session token only. The browser-supplied email,
 * account id or role is never read here — those are re-derived from the record.
 */
export async function requireCustomer(base44: any, req: Request, body: any): Promise<CustomerAuth> {
  if (!sessionSecret()) {
    return { ok: false, status: 503, code: 'CUSTOMER_SESSION_UNAVAILABLE', error: 'Sign-in is temporarily unavailable. Please try again.' };
  }
  const payload = verifyCustomerSession(readSessionToken(req, body));
  if (!payload) {
    return { ok: false, status: 401, code: 'CUSTOMER_SESSION_INVALID', error: 'A valid session is required. Please sign in again.' };
  }

  // Only a real 404 means an account is absent. Rate limits, access errors and outages
  // must propagate as service errors, never become a reason to destroy a valid session.
  const getAccount = (entity: any) => entity.get(payload.sub).catch((error: any) => {
    if ((error?.status || error?.response?.status) === 404) return null;
    throw error;
  });
  let source: 'pending' | 'user' = payload.src || 'pending';
  let record: any = payload.src === 'user' ? null : await getAccount(base44.asServiceRole.entities.PendingSignup);
  if (!record && payload.src !== 'pending') {
    source = 'user';
    record = await getAccount(base44.asServiceRole.entities.User);
    if (record) record = { ...record, user_role: 'user', user_type: record.user_type === 'media_partner' ? 'media_partner' : 'client' };
  }
  if (!record || String(record.email || '').trim().toLowerCase() !== String(payload.email).trim().toLowerCase()) {
    return { ok: false, status: 401, code: 'CUSTOMER_SESSION_INVALID', error: 'Your account could not be found. Please sign in again.' };
  }
  if (Number(record.session_epoch || 0) !== Number(payload.ep || 0)) {
    return { ok: false, status: 401, code: 'CUSTOMER_SESSION_REVOKED', error: 'Your session has ended. Please sign in again.' };
  }

  return {
    ok: true,
    record,
    actor: {
      account_id: record.id,
      account_source: source,
      email: String(record.email || '').trim().toLowerCase(),
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