/**
 * Signed token that lets a Tavus video conversation call the SAME concierge action
 * engine the text interface uses, without a browser session in the loop.
 *
 * The token binds one conversation to one verified customer. It is minted only when a
 * customer with an active Preferred entitlement asks for a video session, and it is
 * verified on every tool callback. A conversation can therefore never act for a
 * different customer, and it expires on its own.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { secrets } from 'base44:runtime';

const TOOL_TOKEN_TTL_SECONDS = 60 * 60 * 2;

function toolSecret(): string {
  return secrets.get('CONCIERGE_TOOL_SECRET') || secrets.get('CUSTOMER_SESSION_SECRET') || '';
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function mintConciergeToolToken(opts: { email: string; conversationId: string; sessionId?: string }) {
  const secret = toolSecret();
  if (!secret || !opts?.email || !opts?.conversationId) return null;
  const issued = Math.floor(Date.now() / 1000);
  const payload = {
    typ: 'concierge_tool',
    email: String(opts.email).trim().toLowerCase(),
    convo: String(opts.conversationId),
    ses: opts.sessionId || '',
    iat: issued,
    exp: issued + TOOL_TOKEN_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyConciergeToolToken(token: string | null | undefined): any | null {
  const secret = toolSecret();
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
    if (payload?.typ !== 'concierge_tool' || !payload?.email || !payload?.convo) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readConciergeToken(req: Request, body: any): string | null {
  if (body && typeof body.concierge_token === 'string' && body.concierge_token) return body.concierge_token;
  const header = req?.headers?.get?.('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}