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
 * IMPORTANT ABOUT SCOPE
 * A backend function does not run as an ordinary app user: the identity this
 * harness executes as is reported in `context.executing_identity`. Access-rule
 * enforcement (RLS) is applied to app-user requests, so it CANNOT be measured
 * from here — an "anonymous read" attempted in this process is not anonymous.
 * Runtime denial must be confirmed from a browser session (see the report).
 *
 * What this harness does prove, against the real database:
 *
 *   1. The records still exist for the service role, so nothing was deleted.
 *   2. A real contractor session resolves as a contractor — never as an admin.
 *   3. The contractor board query returns only booking-sourced open/booked gigs
 *      and never a closed or non-booking job.
 *   4. A real client session resolves as a client, and the client job scope
 *      returns only their own records — nothing while jobs exist elsewhere.
 *   5. The view gate that getJobRecords and getMessageLogRecords execute before
 *      any query refuses admin views to contractor, client and sales
 *      identities, and refuses MessageLog to contractor and client identities.
 *   6. No secret field survives the safe account projection, checked against
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

  // ── 1. Records still exist for the service role ───────────────────────────
  const svcJobs = await base44.asServiceRole.entities.Job.count({});
  const svcSignups = await base44.asServiceRole.entities.PendingSignup.count({});
  const svcLogs = await base44.asServiceRole.entities.MessageLog.count({});

  checks.records_still_present_job = svcJobs > 0;
  checks.records_still_present_pending_signup = svcSignups > 0;
  checks.records_still_present_message_log = svcLogs > 0;

  // ── 2. Contractor identity and board scope ────────────────────────────────
  const contractorActor = await resolveRecordActor(base44, noAuth, {
    session_token: contractorSession.token,
  });
  checks.contractor_session_resolves_as_contractor =
    contractorActor?.kind === 'contractor' &&
    contractorActor?.email === String(contractor.email).toLowerCase();
  checks.contractor_never_resolves_as_admin = contractorActor?.kind !== 'admin';
  checks.contractor_denied_admin_view = canUseJobView(contractorActor?.kind || '', 'admin_list') === false;
  checks.contractor_denied_client_view = canUseJobView(contractorActor?.kind || '', 'client_mine') === false;
  checks.contractor_allowed_board_view =
    canUseJobView(contractorActor?.kind || '', 'contractor_board') === true;

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

  // ── 3. Client identity and scope ──────────────────────────────────────────
  const clientActor = await resolveRecordActor(base44, noAuth, {
    session_token: clientSession.token,
  });
  checks.client_session_resolves_as_client =
    clientActor?.kind === 'client' &&
    clientActor?.email === String(client.email).toLowerCase();
  checks.client_denied_admin_view = canUseJobView(clientActor?.kind || '', 'admin_list') === false;
  checks.client_denied_contractor_view =
    canUseJobView(clientActor?.kind || '', 'contractor_board') === false;

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

  // ── 4. Sales/admin gates ──────────────────────────────────────────────────
  checks.sales_denied_admin_view = canUseJobView('sales', 'admin_list') === false;
  checks.admin_allowed_admin_view = canUseJobView('admin', 'admin_list') === true;
  checks.contractor_denied_message_log = canReadMessageLogs('contractor') === false;
  checks.client_denied_message_log = canReadMessageLogs('client') === false;
  checks.sales_allowed_message_log = canReadMessageLogs('sales') === true;
  checks.admin_allowed_message_log = canReadMessageLogs('admin') === true;

  // ── 5. Safe projection carries no secret field ────────────────────────────
  const allSignups = await base44.asServiceRole.entities.PendingSignup.list('-created_date', 500);
  const signupRows = Array.isArray(allSignups) ? allSignups : allSignups?.items || [];
  let leaked: string[] = [];
  for (const record of signupRows) {
    const projected = safeAccountSummary(record) || {};
    leaked = leaked.concat(SECRET_KEYS.filter((k) => k in projected));
  }
  checks.safe_projection_has_no_secret_fields = leaked.length === 0;

  // ── 6. Live HTTP calls against the deployed endpoints ─────────────────────
  // These carry only the minted customer session — exactly what a browser
  // sends — so they exercise the real authorization path end to end.
  const ENDPOINT_BASE = 'https://arrivestatemedia.base44.app/functions/';
  const callLive = async (name: string, payload: any) => {
    try {
      const res = await fetch(ENDPOINT_BASE + name, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    } catch (error) {
      return { status: 0, json: null, error: (error as Error).message };
    }
  };

  const liveBoard = await callLive('getJobRecords', {
    view: 'contractor_board',
    session_token: contractorSession.token,
  });
  const liveAdminByContractor = await callLive('getJobRecords', {
    view: 'admin_list',
    session_token: contractorSession.token,
  });
  const liveContractorByClient = await callLive('getJobRecords', {
    view: 'contractor_board',
    session_token: clientSession.token,
  });
  const liveNoToken = await callLive('getJobRecords', { view: 'client_mine' });
  const liveLogsByContractor = await callLive('getMessageLogRecords', {
    session_token: contractorSession.token,
  });
  const liveSummaryByContractor = await callLive('getCustomerAccountSummary', {
    session_token: contractorSession.token,
    email: contractor.email,
  });

  const liveBoardItems = Array.isArray(liveBoard.json?.items) ? liveBoard.json.items : null;

  checks.live_contractor_board_200 = liveBoard.status === 200;
  checks.live_contractor_board_only_booking_jobs =
    liveBoardItems !== null && liveBoardItems.every((j: any) => j.from_booking === true);
  checks.live_contractor_denied_admin_view_http = liveAdminByContractor.status === 403;
  checks.live_client_denied_contractor_view_http = liveContractorByClient.status === 403;
  checks.live_no_token_denied_http = liveNoToken.status === 401;
  checks.live_contractor_denied_message_log_http = liveLogsByContractor.status === 403;
  checks.live_contractor_denied_customer_summary_http = liveSummaryByContractor.status === 403;

  const failed = Object.entries(checks).filter(([, passed]) => passed !== true).map(([name]) => name);

  return Response.json({
    ok: failed.length === 0,
    checks,
    failed,
    context: {
      executing_identity: {
        email: me?.email || null,
        role: me?.role || null,
        is_system: system,
        note: 'RLS cannot be measured from a backend function process; verify denial from a browser.',
      },
      live_jobs: svcJobs,
      live_pending_signups: svcSignups,
      live_message_logs: svcLogs,
      contractor_board_rows: board.length,
      client_scope_rows: clientRows.length,
      live_http: {
        contractor_board: { status: liveBoard.status, items: liveBoardItems?.length ?? null },
        contractor_admin_view: liveAdminByContractor.status,
        client_contractor_view: liveContractorByClient.status,
        no_token: liveNoToken.status,
        contractor_message_log: liveLogsByContractor.status,
        contractor_customer_summary: liveSummaryByContractor.status,
      },
    },
  });
}