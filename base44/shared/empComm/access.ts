/**
 * Server-side authorization for employee communications.
 *
 * Two legitimate actors exist:
 *   • the employee themselves, proven by their verified sales session;
 *   • a company administrator, proven by the platform admin role — who may
 *     manage connections and templates but never read another person's mailbox.
 *
 * Every operation resolves the actor here and compares it against the record it
 * is about. A member id supplied by the caller is never treated as identity.
 */

import { requireSalesSession } from '../salesSession.ts';
import { DEFAULT_TENANT } from './tenant.ts';

export const TENANT = DEFAULT_TENANT;

export async function resolveActor(base44: any, req: Request, body: any) {
  const session = await requireSalesSession(base44, req, body);
  if (session.ok) {
    return {
      ok: true as const,
      actor: {
        memberId: session.member.id,
        email: session.member.email || '',
        name: session.member.full_name || session.member.email || 'Employee',
        isAdmin: session.member.role === 'admin',
        source: 'sales_session' as const,
      },
    };
  }
  const user = await base44.auth.me().catch(() => null);
  if (!user) return { ok: false as const, status: 401, error: 'Sign in to use employee communications.' };
  if (user.role !== 'admin') {
    return { ok: false as const, status: 403, error: 'Employee communications require an employee or administrator session.' };
  }
  // Link the administrator to their own employee record when one exists. The
  // employee record may store the address with different casing, so fall back to
  // comparing case-insensitively instead of reporting "no employee".
  const found: any = await base44.asServiceRole.entities.SalesTeamMember
    .filter({ email: user.email })
    .catch(() => []);
  let rows: any[] = Array.isArray(found) ? found : found?.items || [];
  if (!rows.length) {
    const target = String(user.email || '').trim().toLowerCase();
    const all: any = await base44.asServiceRole.entities.SalesTeamMember
      .list('-created_date', 500)
      .catch(() => []);
    const allRows: any[] = Array.isArray(all) ? all : all?.items || [];
    rows = target ? allRows.filter((row: any) => String(row.email || '').trim().toLowerCase() === target) : [];
  }
  const member = rows[0] || null;
  return {
    ok: true as const,
    actor: {
      memberId: member?.id || '',
      email: user.email || '',
      name: member?.full_name || user.full_name || user.email || 'Administrator',
      isAdmin: true,
      source: 'admin' as const,
    },
  };
}

/** The employee a mailbox operation is about. */
export async function resolveTargetMember(base44: any, actor: any, requestedMemberId?: string) {
  const memberId = String(requestedMemberId || actor.memberId || '');
  if (!memberId) return { ok: false as const, status: 400, error: 'No employee was identified for this mailbox.' };
  if (memberId !== actor.memberId && !actor.isAdmin) {
    return { ok: false as const, status: 403, error: 'You can only use your own mailbox.' };
  }
  const member = await base44.asServiceRole.entities.SalesTeamMember.get(memberId).catch(() => null);
  if (!member) return { ok: false as const, status: 404, error: 'That employee record was not found.' };
  return { ok: true as const, member, memberId };
}

/** Mailbox CONTENT is only ever readable by its owner. Admins manage, not read. */
export function assertMailboxOwner(actor: any, memberId: string) {
  if (actor.memberId && actor.memberId === memberId) return null;
  return 'Mailbox contents are private to their owner. Administrators can manage the connection but not read the mailbox.';
}

export async function accountFor(base44: any, memberId: string, provider?: string) {
  const query: any = { tenant_id: TENANT, sales_member_id: memberId };
  if (provider) query.provider = provider;
  // No paging options here: a paged read returns { items } (and can come back
  // empty), so indexing it as an array finds no mailbox even when one is
  // connected. Read plainly and order here instead.
  const result: any = await base44.asServiceRole.entities.EmployeeEmailAccount
    .filter(query)
    .catch(() => []);
  const rows: any[] = Array.isArray(result) ? result : result?.items || [];
  return (
    [...rows].sort((a, b) => String(b?.connected_at || '').localeCompare(String(a?.connected_at || '')))[0] || null
  );
}

export async function audit(base44: any, entry: Record<string, unknown>) {
  await base44.asServiceRole.entities.EmployeeCommAudit.create({
    tenant_id: TENANT,
    at: new Date().toISOString(),
    ...entry,
  }).catch(() => {});
}