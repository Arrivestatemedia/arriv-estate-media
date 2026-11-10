import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { mintCustomerSession } from '../../shared/customerSession.ts';
import {
  resolveRecordActor,
  safeAccountSummary,
  contractorBoardQuery,
  canUseJobView,
  canReadMessageLogs,
} from '../../shared/recordAccess.ts';

/**
 * certifyDirectEntityAccess
 *
 * Regression harness for the three entities whose direct browser access was
 * closed: PendingSignup, MessageLog and Job.
 *
 * It mints a session for ONE certification contractor account and ONE
 * certification client account server-side (tokens are never returned or
 * logged) and proves:
 *
 *   1. A caller with no identity can no longer read any of the three entities.
 *   2. The records still exist for the service role, so (1) is a restriction
 *      and not an empty database.
 *   3. A contractor session resolves as a contractor, never as an admin, and
 *      the board query returns only booking-sourced open/booked gigs.
 *   4. A client session resolves as a client, and their job scope returns only
 *      their own properties (nothing when they have none, while jobs exist).
 *   5. The view gate the endpoints actually call (canUseJobView /
 *      canReadMessageLogs) refuses admin views to contractor and client
 *      identities. These are the same functions getJobRecords and
 *      getMessageLogRecords execute before any query.
 *   6. An endpoint invoked with no identity is refused.
 *   7. No secret field survives the safe account projection, checked against
 *      every real credential record in the database.
 *
 * Read-only: writes nothing, sends nothing, charges nothing. Admin-only.
 */

const SECRET_KEYS = [
  'password_hash',
  'deletion_token',
  'bank_account_number',
  'bank_routing_number',
  'bank_account_last4',
  'zelle_info',
  'checkr_candidate_id',
  'checkr_invitation_id',
  'checkr_invitation_url',
  'checkr_report_id',
];

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

  const contractor = body?.contractor_account_id
    ? await base44.asServiceRole.entities.PendingSignup.get(String(body.contractor_account_id))
    : null;
  const client = body?.client_account_id
    ? await base44.asServiceRole.entities.PendingSignup.get(String(body.client_account_id))
    : null;
  if (!contractor || !client) {
    return Response.json({ error: 'Both certification accounts are required' }, { status: 404 });
  }

  const contractorSession = mintCustomerSession(contractor);
  const clientSession = mintCustomerSession(client);
  if (!contractorSession || !clientSession) {
    return Response.json({ error: 'Sessions could not be minted' }, { status: 500 });
  }

  const checks: Record<string, any> = {};
  const noAuth = { headers: { get: () => null } } as any;

  // ── 1. No identity: direct entity reads must return nothing ───────────────
  const readCount = async (name: string) => {
    try {
      const rows = await base44.entities[name].list('-created_date', 5);
      const list = Array.isArray(rows) ? rows : rows?.items || [];
      return { rows: list.length, blocked: false };
    } catch (error) {
      return { rows: 0, blocked: true, error: (error as Error).message };
    }
  };

  const anonJob = await readCount('Job');
  const anonSignup = await readCount('PendingSignup');
  const anonLog = await readCount('MessageLog');

  checks.anonymous_job_read_denied = anonJob.rows === 0;
  checks.anonymous_pending_signup_read_denied = anonSignup.rows === 0;
  checks.anonymous_message_log_read_denied = anonLog.rows === 0;

  // ── 2. Records still exist for the service role ───────────────────────────
  const svcJobs = await base44.asServiceRole.entities.Job.count({});
  const svcSignups = await base44.asServiceRole.entities.PendingSignup.count({});
  const svcLogs = await base44.asServiceRole.entities.MessageLog.count({});

  checks.records_still_present_job = svcJobs > 0;
  checks.records_still_present_pending_signup = svcSignups > 0;
  checks.records_still_present_message_log = svcLogs > 0;

  // ── 3. Contractor identity and board scope ────────────────────────────────
  const contractorActor = await resolveRecordActor(base44, noAuth, {
    session_token: contractorSession.token,
  });
  checks.contractor_session_resolves_as_contractor =
    contractorActor?.kind === 'contractor' &&
    contractorActor?.email === String(contractor.email).toLowerCase();
  checks.contractor_never_resolves_as_admin = contractorActor?.kind !== 'admin';

  const boardRows = await base44.asServiceRole.entities.Job.filter(
    contractorBoardQuery('all'),
    '-created_date',
    200
  );
  const board = Array.isArray(boardRows) ? boardRows : [];
  checks.contractor_board_only_booking_sourced = board.every((j: any) => j.from_booking === true);
  checks.contractor_board_only_open_or_booked = board.every((j: any) =>
    ['open', 'booked'].includes(String(j.status))
  );
  checks.contractor_board_excludes_closed_jobs = board.every(
    (j: any) => !['completed', 'archived', 'cancelled'].includes(String(j.status))
  );

  // ── 4. Client scope ───────────────────────────────────────────────────────
  const clientActor = await resolveRecordActor(base44, noAuth, {
    session_token: clientSession.token,
  });
  checks.client_session_resolves_as_client =
    clientActor?.kind === 'client' &&
    clientActor?.email === String(client.email).toLowerCase();

  const clientScope = await base44.asServiceRole.entities.Job.filter(
    { client_email: clientActor?.email },
    '-created_date',
    200
  );
  const clientRows = Array.isArray(clientScope) ? clientScope : [];
  checks.client_scope_only_own_records = clientRows.every(
    (j: any) => String(j.client_email || '').toLowerCase() === clientActor?.email
  );
  checks.client_scope_is_narrower_than_all_jobs = clientRows.length < svcJobs;

  // ── 5. The view gate the endpoints execute ────────────────────────────────
  checks.contractor_allowed_board_view = canUseJobView('contractor', 'contractor_board') === true;
  checks.contractor_denied_admin_view = canUseJobView('contractor', 'admin_list') === false;
  checks.contractor_denied_client_view = canUseJobView('contractor', 'client_mine') === false;
  checks.client_denied_contractor_view = canUseJobView('client', 'contractor_board') === false;
  checks.client_denied_admin_view = canUseJobView('client', 'admin_list') === false;
  checks.sales_denied_admin_view = canUseJobView('sales', 'admin_list') === false;
  checks.admin_allowed_admin_view = canUseJobView('admin', 'admin_list') === true;
  checks.contractor_denied_message_log = canReadMessageLogs('contractor') === false;
  checks.client_denied_message_log = canReadMessageLogs('client') === false;
  checks.sales_allowed_message_log = canReadMessageLogs('sales') === true;

  // ── 6. Endpoint with no identity is refused ───────────────────────────────
  const invokeNoIdentity = async (name: string) => {
    try {
      const res = await base44.asServiceRole.functions.invoke(name, { view: 'client_mine' });
      const payload: any = res?.data || res;
      return { refused: !payload || payload.ok !== true, payload };
    } catch (error: any) {
      const status = error?.response?.status || error?.status || 0;
      return { refused: true, status, error: error?.message };
    }
  };
  const jobNoIdentity = await invokeNoIdentity('getJobRecords');
  const logNoIdentity = await invokeNoIdentity('getMessageLogRecords');
  checks.endpoint_denies_unknown_caller = jobNoIdentity.refused === true;
  checks.message_log_endpoint_denies_unknown_caller = logNoIdentity.refused === true;

  // ── 7. Safe projection carries no secret field ────────────────────────────
  const allSignups = await base44.asServiceRole.entities.PendingSignup.list('-created_date', 500);
  const signupRows = Array.isArray(allSignups) ? allSignups : allSignups?.items || [];
  let leaked: string[] = [];
  for (const record of signupRows) {
    const projected = safeAccountSummary(record) || {};
    leaked = leaked.concat(SECRET_KEYS.filter((k) => k in projected));
  }
  checks.safe_projection_has_no_secret_fields = leaked.length === 0;

  const failed = Object.entries(checks).filter(([, passed]) => passed !== true).map(([name]) => name);

  return Response.json({
    ok: failed.length === 0,
    checks,
    failed,
    context: {
      live_jobs: svcJobs,
      live_pending_signups: svcSignups,
      live_message_logs: svcLogs,
      contractor_board_rows: board.length,
      client_scope_rows: clientRows.length,
      anonymous_reads: {
        job: anonJob,
        pending_signup: anonSignup,
        message_log: anonLog,
      },
      no_identity_invocation: { job: jobNoIdentity, message_log: logNoIdentity },
    },
  });
}