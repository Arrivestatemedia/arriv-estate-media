/**
 * One authorisation door for the Arriv One AI surfaces.
 *
 * Two legitimate callers exist:
 *  1. A logged-in sales representative, whose bridge token is verified and whose
 *     member record is re-read on every call (deactivation revokes instantly).
 *  2. The owner / an administrator signed into the platform with role "admin".
 *
 * Anything else is refused. The returned `member` is what attribution uses, so
 * a command is never written against the wrong representative.
 */

import { requireSalesSession } from './salesSession.ts';

export type ArrivOneActor = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  source: 'sales_session' | 'admin';
  sales_member_id: string;
};

export async function authorizeArrivOne(
  base44: any,
  req: Request,
  body: any
): Promise<{ ok: true; actor: ArrivOneActor } | { ok: false; status: number; error: string }> {
  const session = await requireSalesSession(base44, req, body);
  if (session.ok) {
    const member = session.member;
    return {
      ok: true,
      actor: {
        id: member.id,
        full_name: member.full_name || member.preferred_name || member.email || 'Representative',
        email: member.email || '',
        role: 'sales',
        source: 'sales_session',
        sales_member_id: member.id,
      },
    };
  }

  const user = await base44.auth.me().catch(() => null);
  if (!user || user.role !== 'admin') {
    return { ok: false, status: 401, error: 'Sign in as an Arriv One representative or an administrator.' };
  }

  // The owner usually has a SalesTeamMember row. Attribute to it when present so
  // activity, commission and reporting lines stay consistent with the rep flow.
  let member: any = null;
  try {
    const rows = await base44.asServiceRole.entities.SalesTeamMember.filter({ email: user.email }, { limit: 1 });
    member = (Array.isArray(rows) ? rows : rows?.items || [])[0] || null;
  } catch {
    member = null;
  }

  return {
    ok: true,
    actor: {
      id: member?.id || user.id,
      full_name: member?.full_name || user.full_name || user.email || 'Owner',
      email: user.email || '',
      role: 'admin',
      source: 'admin',
      sales_member_id: member?.id || '',
    },
  };
}

export async function requireAdmin(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user || user.role !== 'admin') return { ok: false as const, status: 403, error: 'Administrator access is required.' };
  return { ok: true as const, user };
}