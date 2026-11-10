import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { mintCustomerSession, requireCustomer } from '../../shared/customerSession.ts';
import { resolvePropertyActor, actorOwnsListing } from '../../shared/propertyActor.ts';
import { resolveVisibilityActor, actorOwnsEmail } from '../../shared/visibilityActor.ts';

/**
 * certifyCustomerSessionGroups
 *
 * Certification harness for the portal's session-backed authorization.
 *
 * It mints a session for ONE test account server-side (the token is never returned or logged) and
 * exercises the exact authorization code the customer-facing endpoints run on:
 *   requireCustomer, resolvePropertyActor, resolveVisibilityActor and their ownership predicates.
 *
 * The resolvers are also exercised through a client that has NO signed-in person, which is the shape
 * of a browser request: that is what proves a caller-supplied address is no longer accepted as
 * identity once the session is absent.
 *
 * Read-only: it writes nothing, calls no payment provider and sends no email or text. Admin-only.
 */

const isSystemEmail = (email: string) => !email || /@no-reply\.base44\.com$/i.test(email);

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  let me: any = null;
  try {
    me = await base44.auth.me();
  } catch {
    me = null;
  }
  const system = isSystemEmail(String(me?.email || ''));
  if (!system && me?.role !== 'admin') {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  const account = body?.account_id
    ? await base44.asServiceRole.entities.PendingSignup.get(String(body.account_id))
    : null;
  if (!account) return Response.json({ error: 'Test account not found' }, { status: 404 });

  const minted = mintCustomerSession(account);
  if (!minted) return Response.json({ error: 'Session could not be minted' }, { status: 500 });

  const valid = minted.token;
  const forged = valid.slice(0, -6) + 'AAAAAA';
  const email = String(account.email || '').toLowerCase();
  const other = 'someone.else@example.com';
  const noRequest = { headers: { get: () => null } } as any;

  // A client with no signed-in person and no administrator: the shape of a plain browser request.
  const anonymousClient: any = {
    auth: { me: async () => { throw new Error('not signed in'); } },
    asServiceRole: { entities: base44.asServiceRole.entities },
  };

  const checks: Record<string, any> = {};

  // ── 1. The session guard itself ─────────────────────────────────────────
  const noCred = await requireCustomer(base44, noRequest, {});
  const badCred = await requireCustomer(base44, noRequest, { session_token: forged });
  const goodCred = await requireCustomer(base44, noRequest, { session_token: valid });
  const claimCred = await requireCustomer(base44, noRequest, { session_token: valid, email: other, clientEmail: other, client_email: other });

  checks.session_missing_refused = noCred.ok === false && noCred.status === 401;
  checks.session_forged_refused = badCred.ok === false && badCred.status === 401;
  checks.session_valid_accepted = goodCred.ok === true && goodCred.actor.email === email;
  checks.session_body_address_ignored = claimCred.ok === true && claimCred.actor.email === email;

  // ── 2. Property identity (Group 1) ──────────────────────────────────────
  const propertyClaimed = await resolvePropertyActor(anonymousClient, { clientEmail: other, client_email: other });
  const propertyValid = await resolvePropertyActor(anonymousClient, { clientEmail: other, client_email: other, session_token: valid });

  checks.property_unverified_address_refused = propertyClaimed.isAdmin === false && propertyClaimed.clientEmail === '';
  checks.property_session_address_accepted = propertyValid.isAdmin === false && propertyValid.clientEmail === email;
  checks.property_foreign_record_refused = actorOwnsListing({ client_email: other }, propertyValid) === false;
  checks.property_own_record_allowed = actorOwnsListing({ client_email: email }, propertyValid) === true;

  // ── 3. Visibility identity (Group 2) ────────────────────────────────────
  const visibilityClaimed = await resolveVisibilityActor(anonymousClient, { email: other, clientEmail: other });
  const visibilityValid = await resolveVisibilityActor(anonymousClient, { email: other, clientEmail: other, session_token: valid });

  checks.visibility_unverified_address_refused = visibilityClaimed.isAdmin === false && visibilityClaimed.email === '';
  checks.visibility_session_address_accepted = visibilityValid.isAdmin === false && visibilityValid.email === email;
  checks.visibility_foreign_record_refused = actorOwnsEmail(other, visibilityValid) === false;
  checks.visibility_own_record_allowed = actorOwnsEmail(email, visibilityValid) === true;

  const failed = Object.entries(checks).filter(([, passed]) => passed !== true).map(([name]) => name);

  return Response.json({
    ok: failed.length === 0,
    account: email,
    checks,
    failed,
  });
}