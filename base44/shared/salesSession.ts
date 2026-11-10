import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

/**
 * Bridge token for the EXISTING sales team login.
 *
 * salesTeamLogin keeps verifying the same SalesTeamMember password with the same
 * PBKDF2 hash. The only addition is that a successful password check also mints
 * a signed, expiring token, so a representative who has no Base44 platform
 * account can still be recognised by backend functions.
 *
 * Deliberate limits:
 *  - It always resolves to the 'sales' role. It can never produce 'admin'.
 *  - It carries no `sub`, so verifyCustomerSession (which requires one) and this
 *    verifier cannot be swapped for each other in either direction.
 *  - requireSalesSession re-reads the member on every call and re-checks the
 *    email and is_active flag, so deactivating a rep revokes their token.
 *  - No CUSTOMER_SESSION_SECRET configured => fail closed: no token minted,
 *    every request refused.
 */

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
const AUDIENCE = 'sales_rep';

export type SalesSession =
  | { ok: true; member: any }
  | { ok: false; status: number; error: string };

function sessionSecret(): string {
  return Deno.env.get('CUSTOMER_SESSION_SECRET') || '';
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/** Mint a bridge token for a verified SalesTeamMember. Null when unconfigured. */
export function mintSalesSession(member: any): { token: string; expires_at: string } | null {
  const secret = sessionSecret();
  if (!secret || !member?.id || !member?.email) return null;

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    aud: AUDIENCE,
    smt: member.id,
    email: String(member.email).toLowerCase(),
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  };

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return {
    token: `${body}.${sign(body, secret)}`,
    expires_at: new Date((issuedAt + SESSION_TTL_SECONDS) * 1000).toISOString(),
  };
}

/** Verify signature, audience and expiry. Returns the payload or null. */
export function verifySalesSession(token: string | null | undefined): any | null {
  const secret = sessionSecret();
  if (!secret || !token || typeof token !== 'string') return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const provided = Buffer.from(signature);
  const expected = Buffer.from(sign(body, secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload?.aud !== AUDIENCE || !payload?.smt || !payload?.email) return null;
    if (Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function readToken(req: Request, body: any): string | null {
  if (body && typeof body.sales_session_token === 'string' && body.sales_session_token) {
    return body.sales_session_token;
  }
  const header = req?.headers?.get?.('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}

/** Authorise from the bridge token only, then re-check the member record. */
export async function requireSalesSession(base44: any, req: Request, body: any): Promise<SalesSession> {
  const payload = verifySalesSession(readToken(req, body));
  if (!payload) return { ok: false, status: 401, error: 'No sales session.' };

  let member: any = null;
  try {
    member = await base44.asServiceRole.entities.SalesTeamMember.get(payload.smt);
  } catch {
    member = null;
  }

  if (!member) return { ok: false, status: 401, error: 'No sales session.' };

  const memberEmail = String(member.email || '').trim().toLowerCase();
  if (!memberEmail || memberEmail !== String(payload.email || '').toLowerCase()) {
    return { ok: false, status: 401, error: 'No sales session.' };
  }
  if (member.is_active === false) {
    return { ok: false, status: 403, error: 'This account is inactive.' };
  }

  return { ok: true, member };
}