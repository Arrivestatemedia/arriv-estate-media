/**
 * Certification Run Cleanup — reliable, run-scoped teardown for certification suites.
 *
 * WHY THIS EXISTS
 * Certification suites write synthetic records into production-backed entities. Two
 * failure modes were verified in production:
 *   1. A suite with NO teardown at all (every run left its fixtures behind, and they
 *      accumulated: 22 synthetic contacts were found across repeated runs).
 *   2. A suite whose teardown only removed the records it wrote while the suite was
 *      failing early — when the enrollment gate opened, the suite began successfully
 *      creating enrollment artifacts (subscription, wallet, consent, jurisdiction audit)
 *      that its teardown had never been written to remove.
 *
 * DESIGN
 *   - Scoped strictly to one run: every query is anchored on the run's own identifier
 *     prefix (`^cert_...`) or on the exact synthetic emails/employee IDs the caller
 *     declares. Nothing outside the run can match, so no legitimate customer, wallet,
 *     payment, payroll or employee record is ever touched.
 *   - Idempotent: a second call finds nothing and deletes nothing.
 *   - Complete: covers the dependent objects too (consent records, wallets, credit lots,
 *     fee events, dispute cases, notices, allowance/jurisdiction rows), deleted
 *     dependents-first.
 *   - Self-verifying: returns how many run-scoped records remain, so a suite can assert
 *     zero leftovers instead of asserting only on the one entity it remembered.
 *   - Marker-guarded: a record is only deleted when its own identifier carries a
 *     synthetic marker, so an over-broad query still cannot delete real data.
 */

const SYNTHETIC_PATTERNS: RegExp[] = [
  /^cert_/i,
  /^cert-/i,
  /^isolation_/i,
  /^prod_test_/i,
  /^test-/i,
  /@(cert\.test|arriv\.internal|cert\.arriv\.internal|example\.com)$/i,
];

/** True when a value is a declared synthetic marker (cert_/TEST-/isolation_/@cert.test…). */
export function isSyntheticMarker(value: unknown): boolean {
  if (value == null) return false;
  const v = String(value);
  if (!v.trim()) return false;
  return SYNTHETIC_PATTERNS.some((p) => p.test(v));
}

export interface CertCleanupResult {
  run_id: string;
  deleted: { entity: string; id: string; key: string }[];
  errors: string[];
  /** Run-scoped records still present after cleanup. Zero means the run is fully gone. */
  remaining: number;
  remaining_by_entity: Record<string, number>;
}

interface SweepSpec {
  entity: string;
  /** Field holding the run-scoped value (matched with a ^runId regex). */
  field: string;
  /** Extra fields on the same entity to match exact values against. */
  exact?: { field: string; values: string[] }[];
}

// Dependents first, then the records they hang from.
const SWEEP: SweepSpec[] = [
  { entity: 'WalletTransaction', field: 'customer_email', exact: [{ field: 'transaction_id', values: [] }] },
  { entity: 'CreditLot', field: 'customer_email' },
  { entity: 'AutoFundPaymentEvent', field: 'payment_event_id', exact: [{ field: 'customer_email', values: [] }] },
  { entity: 'PrepaidCompensationEvent', field: 'source_event_id', exact: [{ field: 'employee_email', values: [] }] },
  { entity: 'PaymentRecoveryNotification', field: 'notification_id', exact: [{ field: 'customer_email', values: [] }] },
  { entity: 'AutoFundMembershipNotice', field: 'notice_id', exact: [{ field: 'customer_email', values: [] }] },
  { entity: 'AutoFundDisputeCase', field: 'dispute_reference', exact: [{ field: 'customer_email', values: [] }] },
  { entity: 'AutoFundJurisdictionAudit', field: 'audit_id', exact: [{ field: 'customer_email', values: [] }] },
  { entity: 'AutoFundConsentRecord', field: 'consent_record_id', exact: [{ field: 'customer_email', values: [] }] },
  { entity: 'AutoFundMlsAllowance', field: 'customer_email' },
  { entity: 'AutoFundAdvisorRequest', field: 'request_id', exact: [{ field: 'customer_email', values: [] }] },
  { entity: 'AutoFundCohortMember', field: 'cohort_member_id', exact: [{ field: 'customer_email', values: [] }] },
  { entity: 'AutoFundSubscription', field: 'subscription_id', exact: [{ field: 'customer_email', values: [] }] },
  { entity: 'PrepaidWallet', field: 'customer_email', exact: [{ field: 'customer_email', values: [] }] },
  { entity: 'EmployeeSyncQueue', field: 'sync_id', exact: [{ field: 'arriv_employee_id', values: [] }] },
  { entity: 'Contact', field: 'email', exact: [{ field: 'email', values: [] }] },
];

/**
 * Delete every record created by one certification run.
 *
 * @param client  a service-role client (`base44.asServiceRole`)
 * @param runId   the run's identifier; MUST be `cert_`-prefixed
 * @param extraEmails  synthetic emails used by the run that are not `<runId>@cert.test`
 *                     (e.g. a suite simulating a production identity). Each must carry a
 *                     synthetic marker or it is refused.
 * @param extraEmployeeIds synthetic employee IDs the run wrote
 */
export async function cleanupCertRun(
  client: any,
  runId: string,
  extraEmails: string[] = [],
  extraEmployeeIds: string[] = [],
): Promise<CertCleanupResult> {
  const deleted: { entity: string; id: string; key: string }[] = [];
  const errors: string[] = [];
  const result: CertCleanupResult = { run_id: runId, deleted, errors, remaining: 0, remaining_by_entity: {} };

  if (!runId || !String(runId).startsWith('cert_')) {
    errors.push(`Refusing to clean up non-cert_ run ID: ${runId}`);
    return result;
  }

  const emails: string[] = [`${runId}@cert.test`];
  for (const e of extraEmails || []) {
    if (!e) continue;
    // Declared by the run's own caller; the marker check is what stops a real customer
    // email from ever reaching a delete.
    if (!isSyntheticMarker(e)) {
      errors.push(`Refused non-synthetic email: ${e}`);
      continue;
    }
    emails.push(e);
  }
  const employeeIds = (extraEmployeeIds || []).filter((v) => v && isSyntheticMarker(v));
  if (extraEmployeeIds && extraEmployeeIds.length !== employeeIds.length) {
    errors.push('Refused one or more non-run synthetic employee IDs');
  }

  const prefix = { $regex: `^${runId}` };

  // Every identity a record of this run can be recognized by. The SAME set is used for
  // deletion and for the verification pass, so `remaining` can never under-report a
  // fixture whose identity does not carry the run id (a suite simulating a production
  // customer uses an isolation_prod_ identity, for example).
  const buildQueries = (spec: SweepSpec): Record<string, unknown>[] => {
    const queries: Record<string, unknown>[] = [{ [spec.field]: prefix }];
    for (const ex of spec.exact || []) {
      if (ex.field === 'customer_email' || ex.field === 'employee_email' || ex.field === 'email') {
        queries.push({ [ex.field]: { $in: emails } });
      } else if (ex.field === 'arriv_employee_id' && employeeIds.length) {
        queries.push({ [ex.field]: { $in: employeeIds } });
      }
    }
    return queries;
  };

  for (const spec of SWEEP) {
    const entity = client.entities?.[spec.entity];
    if (!entity) continue;
    for (const q of buildQueries(spec)) {
      let rows: any[] = [];
      try {
        const res = await entity.filter(q, '-created_date', 200);
        rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
      } catch (e: any) {
        errors.push(`${spec.entity} query: ${e.message}`);
        continue;
      }
      for (const row of rows) {
        // Marker guard — never delete a record whose own identity is not synthetic.
        const candidates = [row[spec.field], row.customer_email, row.email, row.employee_email, row.arriv_employee_id];
        if (!candidates.some((c) => isSyntheticMarker(c) || (c && String(c).includes(runId)))) continue;
        try {
          await entity.delete(row.id);
          deleted.push({ entity: spec.entity, id: row.id, key: String(row[spec.field] ?? '').slice(0, 60) });
        } catch (e: any) {
          errors.push(`${spec.entity}.${row.id}: ${e.message}`);
        }
      }
    }
  }

  // Verify: nothing belonging to this run may remain, by ANY of its identities.
  for (const spec of SWEEP) {
    const entity = client.entities?.[spec.entity];
    if (!entity) continue;
    const seen = new Set<string>();
    for (const q of buildQueries(spec)) {
      try {
        const res = await entity.filter(q, '-created_date', 200);
        const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
        for (const r of rows) seen.add(r.id);
      } catch { /* verification is best-effort; deletion errors are already reported */ }
    }
    if (seen.size) {
      result.remaining_by_entity[spec.entity] = seen.size;
      result.remaining += seen.size;
    }
  }
  return result;
}

/**
 * Reconcile synthetic records left behind by INTERRUPTED certification runs.
 *
 * In-process teardown cannot cover every failure: if the platform kills the function
 * mid-run (timeout, cold-start eviction), no catch or finally block ever executes and
 * the fixtures stay. This discovers runs from the synthetic records themselves and
 * removes them, so cleanup holds for success, failure, interruption and retry alike.
 *
 * AGE GUARD: only records older than `olderThanMinutes` are considered, so a suite that
 * is still running never has its fixtures pulled out from under it.
 */
export async function sweepStaleCertRuns(client: any, olderThanMinutes = 30) {
  const cutoff = Date.now() - olderThanMinutes * 60 * 1000;
  const isStale = (record: any) => {
    const stamp = Date.parse(record?.created_date || record?.created_at || record?.authorized_at || '');
    return Number.isNaN(stamp) ? true : stamp <= cutoff;
  };

  const runIds = new Set<string>();
  const probes: { entity: string; field: string }[] = [
    { entity: 'AutoFundPaymentEvent', field: 'payment_event_id' },
    { entity: 'AutoFundConsentRecord', field: 'consent_record_id' },
    { entity: 'AutoFundSubscription', field: 'subscription_id' },
    { entity: 'EmployeeSyncQueue', field: 'sync_id' },
    { entity: 'AutoFundJurisdictionAudit', field: 'audit_id' },
    { entity: 'AutoFundDisputeCase', field: 'dispute_reference' },
    { entity: 'AutoFundMembershipNotice', field: 'notice_id' },
    { entity: 'PaymentRecoveryNotification', field: 'notification_id' },
    // An interrupted run can leave ONLY its contact behind (its own teardown removed
    // everything else before the process was killed), so the contact is a run source too.
    { entity: 'Contact', field: 'email' },
  ];
  for (const probe of probes) {
    const entity = client.entities?.[probe.entity];
    if (!entity) continue;
    try {
      const res = await entity.filter({ [probe.field]: { $regex: '^cert_' } }, '-created_date', 200);
      const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
      for (const row of rows) {
        if (!isStale(row)) continue;
        const raw = String(row[probe.field] || '');
        // cert_emstop_1791749232667_fee -> cert_emstop_1791749232667 ; cert_179..._customer -> cert_179...
        const m = raw.match(/^(cert_[a-z0-9]*_?\d+)/i);
        if (m && m[1].startsWith('cert_')) runIds.add(m[1]);
      }
    } catch { /* probe is best effort */ }
  }

  const results: CertCleanupResult[] = [];
  for (const runId of runIds) results.push(await cleanupCertRun(client, runId));

  // Standalone synthetic identities that carry no run id (a suite that simulates a
  // production customer, or a fixture keyed only by a marker). Marker- and age-guarded.
  let standalone = 0;
  const standaloneErrors: string[] = [];
  for (const [entity, field] of [['Contact', 'email'], ['PrepaidWallet', 'customer_email'], ['CreditLot', 'customer_email'], ['WalletTransaction', 'customer_email'], ['AutoFundPaymentEvent', 'customer_email']]) {
    const api = client.entities?.[entity];
    if (!api) continue;
    try {
      const res = await api.filter({ [field]: { $regex: '^(isolation_prod_|prod_test_)' } }, '-created_date', 200);
      const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
      for (const row of rows) {
        if (!isStale(row) || !isSyntheticMarker(row[field])) continue;
        try { await api.delete(row.id); standalone++; }
        catch (e: any) { standaloneErrors.push(`${entity}.${row.id}: ${e.message}`); }
      }
    } catch { /* best effort */ }
  }

  return {
    runs_swept: results.length,
    run_ids: [...runIds],
    deleted: results.reduce((n, r) => n + r.deleted.length, 0) + standalone,
    remaining: results.reduce((n, r) => n + r.remaining, 0),
    errors: [...results.flatMap((r) => r.errors), ...standaloneErrors],
    older_than_minutes: olderThanMinutes,
  };
}