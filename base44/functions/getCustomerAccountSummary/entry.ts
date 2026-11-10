import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveRecordActor, safeAccountSummary } from '../../shared/recordAccess.ts';

/**
 * The only browser path to a customer's PendingSignup record.
 *
 * PendingSignup holds password hashes, bank account and routing numbers, Zelle
 * details, deletion tokens and background-check identifiers. Nothing outside
 * this endpoint may read it, and this endpoint returns a fixed safe projection
 * built by safeAccountSummary() — never the stored record.
 *
 *   admin -> any customer
 *   sales -> any customer (Customer360 support work), same safe projection
 *
 * Contractors and clients do not reach this endpoint. A contractor's own
 * account data is served by getMyAccount through their session.
 */

const SAFE_ONLY = 'Only the customer account summary is available here.';

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const actor = await resolveRecordActor(base44, req, body);
  if (!actor) {
    return Response.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (actor.kind !== 'admin' && actor.kind !== 'sales') {
    return Response.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email) {
    return Response.json({ error: 'A customer email is required.' }, { status: 400 });
  }

  try {
    const accounts = base44.asServiceRole.entities.PendingSignup;

    let record = null;
    const direct = await accounts.filter({ email }, undefined, 5);
    const directList = Array.isArray(direct) ? direct : direct?.items || [];
    record = directList.find((r: any) => String(r?.email || '').trim().toLowerCase() === email) || null;

    if (!record) {
      const all = await accounts.list('-created_date', 500);
      const list = Array.isArray(all) ? all : all?.items || [];
      record = list.find((r: any) => String(r?.email || '').trim().toLowerCase() === email) || null;
    }

    return Response.json({ account: safeAccountSummary(record), note: SAFE_ONLY });
  } catch (error) {
    return Response.json({ error: (error as Error).message || 'Could not load the account.' }, { status: 500 });
  }
}