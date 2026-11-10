import { requireCustomer } from './customerSession.ts';
import { requireSalesSession } from './salesSession.ts';

/**
 * Authorization for the three entities that used to be browser-readable:
 * PendingSignup (credentials + banking), MessageLog (message bodies) and Job
 * (customer PII + contractor pay).
 *
 * Every caller is re-derived from a server-verifiable credential. Nothing here
 * reads a browser-supplied email, id or role:
 *
 *   contractor / client -> the signed customer session minted by verifySignIn
 *   admin               -> the platform session, role === 'admin'
 *   sales               -> the platform session, whose email must match an
 *                          active SalesTeamMember record
 *
 * Anything else resolves to null and the endpoint refuses the request.
 */

export type RecordActor =
  | { kind: 'admin'; email: string; member?: null; account?: null }
  | { kind: 'sales'; email: string; member: any; account?: null }
  | { kind: 'contractor'; email: string; account: any; member?: null }
  | { kind: 'client'; email: string; account: any; member?: null };

/** The platform session, when the caller has one. Never throws. */
export async function platformUser(base44: any): Promise<any | null> {
  try {
    const me = await base44.auth.me();
    return me || null;
  } catch {
    return null;
  }
}

/** Active SalesTeamMember for a platform-verified email address. */
export async function resolveSalesMember(base44: any, email: string): Promise<any | null> {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;

  const matches = (rows: any) => {
    const list = Array.isArray(rows) ? rows : rows?.items || [];
    return list.find((m: any) => String(m?.email || '').trim().toLowerCase() === target) || null;
  };

  try {
    const direct = matches(await base44.asServiceRole.entities.SalesTeamMember.filter({ email: target }));
    if (direct) return direct.is_active === false ? null : direct;
  } catch {
    /* fall through to the case-insensitive scan */
  }

  try {
    const all = matches(await base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500));
    if (all) return all.is_active === false ? null : all;
  } catch {
    /* not found */
  }
  return null;
}

/**
 * Resolve the caller. Customer session is tried first so a contractor is never
 * mistaken for an admin, and a platform admin cannot silently borrow a customer
 * identity by posting someone else's session token.
 */
export async function resolveRecordActor(base44: any, req: Request, body: any): Promise<RecordActor | null> {
  const session = await requireCustomer(base44, req, body);
  if (session.ok) {
    const kind = session.actor.user_type === 'media_partner' ? 'contractor' : 'client';
    return { kind, email: session.actor.email, account: session.record } as RecordActor;
  }

  const user = await platformUser(base44);
  const email = String(user?.email || '').trim().toLowerCase();

  if (email && user?.role === 'admin') return { kind: 'admin', email };

  // A representative signed in through the existing sales login may have no
  // platform account at all. Their bridge token is verified against the
  // SalesTeamMember record and always resolves to 'sales' — never admin, and
  // never a different representative.
  const sales = await requireSalesSession(base44, req, body);
  if (sales.ok) {
    return { kind: 'sales', email: String(sales.member.email || '').toLowerCase(), member: sales.member };
  }

  if (!email) return null;

  const member = await resolveSalesMember(base44, email);
  if (member) return { kind: 'sales', email, member };

  return null;
}

/** The only PendingSignup fields any non-administrator screen may receive. */
export function safeAccountSummary(record: any) {
  if (!record) return null;
  return {
    id: record.id,
    email: record.email || '',
    full_name: record.full_name || '',
    user_type: record.user_type || 'client',
    user_role: record.user_role === 'admin' ? 'admin' : 'user',
    status: record.status || 'pending',
    created_date: record.created_date || '',
  };
}

/** Job visibility for a contractor browsing the board. */
export function contractorBoardQuery(statusFilter?: string) {
  return {
    from_booking: true,
    status: statusFilter === 'open' ? 'open' : { $in: ['open', 'booked'] },
  };
}

/**
 * Which Job views each caller kind may ask for. getJobRecords calls this before
 * it queries anything, so a view is only ever reachable by the identities
 * listed here — and the certification harness exercises this same function.
 */
export function canUseJobView(kind: RecordActor['kind'] | string, view: string): boolean {
  switch (kind) {
    case 'contractor':
      return view === 'contractor_board' || view === 'contractor_mine';
    case 'client':
      return view === 'client_mine';
    case 'sales':
      return view === 'sales_list' || view === 'sales_client';
    case 'admin':
      return (
        view === 'admin_list' ||
        view === 'admin_one' ||
        view === 'sales_list' ||
        view === 'sales_client' ||
        view === 'client_mine' ||
        view === 'contractor_mine'
      );
    default:
      return false;
  }
}

/** MessageLog is readable by administrators and sales representatives only. */
export function canReadMessageLogs(kind: RecordActor['kind'] | string): boolean {
  return kind === 'admin' || kind === 'sales';
}

/** Emails a sales rep is allowed to read message history for. */
export function salesMessageEmails(actor: RecordActor): string[] {
  if (actor.kind !== 'sales') return [];
  const set = new Set<string>();
  const push = (v: any) => {
    const t = String(v || '').trim().toLowerCase();
    if (t) set.add(t);
  };
  push(actor.email);
  push(actor.member?.company_email);
  push(actor.member?.email);
  return [...set];
}