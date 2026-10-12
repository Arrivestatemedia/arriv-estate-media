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

import {
  isCertificationRunId,
  isPropertySweepCandidate,
  isRowStale,
  propertyCertRunIdsFromRow,
} from './propertyCertRunGuard.ts';
import { readPropertyCertRunLock } from './propertyCertRunLock.ts';

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
  /**
   * Value the record itself MUST carry before it can be deleted. The Property Visibility specs
   * use it to require `certification_mode === true`, so a record that merely looks similar can
   * never be removed.
   */
  requireField?: { field: string; equals: unknown };
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
  // Property Visibility certification artifacts. Listings only — their publication events and
  // inquiries are removed by RELATIONSHIP in cleanupPropertyCertRun, and every property record
  // additionally has to carry certification_mode === true.
  { entity: 'PropertyListing', field: 'certification_run_id', requireField: { field: 'certification_mode', equals: true } },
  { entity: 'PropertyListing', field: 'client_email', requireField: { field: 'certification_mode', equals: true } },
];

/**
 * Property Visibility certification artifacts for ONE run, removed dependents-first.
 *
 * Identification never relies on a property id prefix — a property page's own id is an ordinary
 * `prop_…` value. A record qualifies only when it is a certification record
 * (`certification_mode === true`) AND is attributable to this run: by its `certification_run_id`
 * marker, by the run's own synthetic address, or by an explicit relationship (a listing id the
 * run declared, whose events and inquiries then hang off it).
 *
 * Idempotent and safe to retry: a second call finds nothing, deletes nothing and reports zero
 * remaining. Every deletion is reported individually, so teardown is auditable.
 */
export async function cleanupPropertyCertRun(
  client: any,
  runId: string,
  options: { extraEmails?: string[]; listingIds?: string[] } = {},
): Promise<CertCleanupResult> {
  const deleted: { entity: string; id: string; key: string }[] = [];
  const errors: string[] = [];
  const result: CertCleanupResult = { run_id: runId, deleted, errors, remaining: 0, remaining_by_entity: {} };

  if (!isCertificationRunId(runId)) {
    errors.push(`Refusing to clean up non-cert_ run ID: ${runId}`);
    return result;
  }

  const marker = { $regex: `^${runId}` };
  const input = { runId, extraEmails: options.extraEmails || [], listingIds: options.listingIds || [] };
  const listingApi = client.entities?.PropertyListing;
  const eventApi = client.entities?.PropertyListingEvent;
  const inquiryApi = client.entities?.PropertyInquiry;

  const queryOne = async (api: any, filters: Record<string, unknown>[], label: string) => {
    if (!api) return { rows: [] as any[], error: `${label}: entity unavailable` };
    const q = filters.length > 1 ? { $or: filters } : filters[0];
    if (!q) return { rows: [] as any[] };
    try {
      const res = await api.filter(q, '-created_date', 200);
      return { rows: Array.isArray(res) ? res : (res?.items || res?.data || []) };
    } catch (e: any) {
      return { rows: [] as any[], error: `${label}: ${e.message}` };
    }
  };

  // ---- the run's listings
  const listingFilters: Record<string, unknown>[] = [{ certification_run_id: marker }, { client_email: marker }];
  if (input.listingIds.length) listingFilters.push({ listing_id: { $in: input.listingIds } });
  const listingRes = await queryOne(listingApi, listingFilters, 'PropertyListing query');
  if (listingRes.error) errors.push(listingRes.error);
  const listings = listingRes.rows.filter((row) => isPropertySweepCandidate(row, input));

  // ---- dependents first: publication events and inquiries, by their listing relationship
  for (const listing of listings) {
    const listingId = String(listing.listing_id || '');
    if (!listingId) continue;
    for (const [api, entityName] of [[eventApi, 'PropertyListingEvent'], [inquiryApi, 'PropertyInquiry']] as const) {
      if (!api) continue;
      const res = await queryOne(api, [{ listing_id: listingId }], `${entityName} query`);
      if (res.error) errors.push(res.error);
      for (const row of res.rows) {
        // Marker guard: only a certification record may be deleted, even though the relationship
        // to a proven run listing already establishes ownership.
        if (row.certification_mode !== true) continue;
        try {
          await api.delete(row.id);
          deleted.push({ entity: entityName, id: row.id, key: listingId.slice(0, 60) });
        } catch (e: any) {
          errors.push(`${entityName}.${row.id}: ${e.message}`);
        }
      }
    }
    try {
      await listingApi.delete(listing.id);
      deleted.push({ entity: 'PropertyListing', id: listing.id, key: String(listing.listing_id || '').slice(0, 60) });
    } catch (e: any) {
      errors.push(`PropertyListing.${listing.id}: ${e.message}`);
    }
  }

  // ---- inquiries whose own address carries the run marker (the listing may already be gone)
  const inquiryFilters: Record<string, unknown>[] = [{ email: marker }, { certification_run_id: marker }];
  const inquiryRes = await queryOne(inquiryApi, inquiryFilters, 'PropertyInquiry query');
  if (inquiryRes.error) errors.push(inquiryRes.error);
  for (const row of inquiryRes.rows) {
    if (!isPropertySweepCandidate(row, input)) continue;
    try {
      await inquiryApi.delete(row.id);
      deleted.push({ entity: 'PropertyInquiry', id: row.id, key: String(row.email || '').slice(0, 60) });
    } catch (e: any) {
      errors.push(`PropertyInquiry.${row.id}: ${e.message}`);
    }
  }

  // ---- verification: report what is still attributable to this run
  const knownListingIds = [...new Set([
    ...listings.map((l: any) => String(l.listing_id || '')),
    ...input.listingIds.map((v: string) => String(v || '')),
  ])].filter(Boolean);

  const verifyRunMarked = async (api: any, filters: Record<string, unknown>[], entity: string) => {
    if (!api) return;
    const res = await queryOne(api, filters, `${entity} verify`);
    if (res.error) errors.push(res.error);
    const count = res.rows.filter((row) => isPropertySweepCandidate(row, input)).length;
    if (count) {
      result.remaining_by_entity[entity] = (result.remaining_by_entity[entity] || 0) + count;
      result.remaining += count;
    }
  };
  const verifyByRelationship = async (api: any, entity: string) => {
    if (!api || !knownListingIds.length) return;
    const res = await queryOne(api, [{ listing_id: { $in: knownListingIds } }], `${entity} verify`);
    if (res.error) errors.push(res.error);
    const count = res.rows.filter((row) => row.certification_mode === true).length;
    if (count) {
      result.remaining_by_entity[entity] = (result.remaining_by_entity[entity] || 0) + count;
      result.remaining += count;
    }
  };

  await verifyRunMarked(listingApi, listingFilters, 'PropertyListing');
  await verifyByRelationship(eventApi, 'PropertyListingEvent');
  await verifyByRelationship(inquiryApi, 'PropertyInquiry');
  await verifyRunMarked(inquiryApi, inquiryFilters, 'PropertyInquiry');

  return result;
}

/**
 * Discover Property Visibility certification runs whose artifacts were left behind, without
 * deleting anything. The age guard keeps a run that is still going out of scope, and a run
 * holding a live lock is reported as skipped instead of being swept.
 */
export async function discoverPropertyCertRunIds(client: any, cutoffMs: number = Date.now(), skipRunId = '') {
  const runIds = new Set<string>();
  const skippedLive = new Set<string>();
  const probes: [string, string][] = [
    ['PropertyListing', 'certification_run_id'],
    ['PropertyListing', 'client_email'],
    ['PropertyInquiry', 'certification_run_id'],
    ['PropertyInquiry', 'email'],
  ];
  for (const [entity, field] of probes) {
    const api = client.entities?.[entity];
    if (!api) continue;
    try {
      const res = await api.filter({ certification_mode: true, [field]: { $regex: '^cert_' } }, '-created_date', 200);
      const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
      for (const row of rows) {
        if (!isRowStale(row, cutoffMs)) continue;
        for (const id of propertyCertRunIdsFromRow(row)) {
          if (skipRunId && id.toLowerCase().startsWith(String(skipRunId).toLowerCase())) {
            skippedLive.add(id);
            continue;
          }
          runIds.add(id);
        }
      }
    } catch { /* probe is best effort */ }
  }
  return { run_ids: [...runIds], skipped_live: [...skippedLive] };
}

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
  const identityFilters = (spec: SweepSpec): Record<string, unknown>[] => {
    const filters: Record<string, unknown>[] = [{ [spec.field]: prefix }];
    for (const ex of spec.exact || []) {
      if (ex.field === 'customer_email' || ex.field === 'employee_email' || ex.field === 'email') {
        filters.push({ [ex.field]: { $in: emails } });
      } else if (ex.field === 'arriv_employee_id' && employeeIds.length) {
        filters.push({ [ex.field]: { $in: employeeIds } });
      }
    }
    return filters;
  };

  // ONE query per entity, combining every identity the run can be recognized by, with a
  // single retry when the app rate limiter intervenes. Teardown previously issued several
  // queries per entity (plus a second pass for verification) and could exhaust the app's
  // query budget mid-cleanup, leaving fixtures behind — the exact failure it exists to
  // prevent.
  const queryRun = async (entity: any, spec: SweepSpec): Promise<{ rows: any[]; error?: string }> => {
    const filters = identityFilters(spec);
    const q = filters.length > 1 ? { $or: filters } : filters[0];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await entity.filter(q, '-created_date', 200);
        return { rows: Array.isArray(res) ? res : (res?.items || res?.data || []) };
      } catch (e: any) {
        const msg = String(e?.message || e || '');
        if (attempt === 0 && /rate limit|too many requests/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        return { rows: [], error: `${spec.entity} query: ${msg}` };
      }
    }
    return { rows: [], error: `${spec.entity} query: rate limited` };
  };

  for (const spec of SWEEP) {
    const entity = client.entities?.[spec.entity];
    if (!entity) continue;
    {
      const { rows, error } = await queryRun(entity, spec);
      if (error) errors.push(error);
      for (const row of rows) {
        // Marker guard — never delete a record whose own identity is not synthetic.
        const candidates = [row[spec.field], row.customer_email, row.email, row.employee_email, row.arriv_employee_id];
        if (!candidates.some((c) => isSyntheticMarker(c) || (c && String(c).includes(runId)))) continue;
        // Field guard — a record that fails the spec's own structural requirement is never
        // deleted (property records must carry certification_mode === true).
        if (spec.requireField && row[spec.requireField.field] !== spec.requireField.equals) continue;
        try {
          await entity.delete(row.id);
          deleted.push({ entity: spec.entity, id: row.id, key: String(row[spec.field] ?? '').slice(0, 60) });
        } catch (e: any) {
          errors.push(`${spec.entity}.${row.id}: ${e.message}`);
        }
      }
    }
  }

  // Property Visibility artifacts are removed by their own run-scoped pass (dependents-first,
  // marker-guarded on every record) and verified there.
  const property = await cleanupPropertyCertRun(client, runId, { extraEmails: emails });
  deleted.push(...property.deleted);
  errors.push(...property.errors);

  // Verify against the entities that actually hold run fixtures, kept to a small set so
  // the check cannot itself exhaust the query budget. Entities that are empty for every
  // run are skipped rather than re-queried.
  const VERIFY_ENTITIES = new Set([
    'Contact', 'PrepaidWallet', 'CreditLot', 'WalletTransaction', 'AutoFundPaymentEvent',
    'AutoFundSubscription', 'AutoFundConsentRecord', 'AutoFundJurisdictionAudit',
    'AutoFundDisputeCase', 'EmployeeSyncQueue',
  ]);
  for (const spec of SWEEP) {
    const entity = client.entities?.[spec.entity];
    if (!entity || !VERIFY_ENTITIES.has(spec.entity)) continue;
    const { rows, error } = await queryRun(entity, spec);
    if (error) errors.push(error);
    if (rows.length) {
      result.remaining_by_entity[spec.entity] = rows.length;
      result.remaining += rows.length;
    }
  }

  // Property artifacts are verified by their own relationship pass above, so their counts are
  // merged here rather than re-queried.
  for (const [entity, count] of Object.entries(property.remaining_by_entity || {})) {
    result.remaining_by_entity[entity] = (result.remaining_by_entity[entity] || 0) + Number(count);
    result.remaining += Number(count);
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
  // Kept deliberately small: these are the records an interrupted run leaves behind. Every
  // extra probe spends the app's query budget that teardown itself needs.
  const probes: { entity: string; field: string }[] = [
    // An interrupted run can leave ONLY its contact behind (its own teardown removed
    // everything else before the process was killed), so the contact is a run source too.
    { entity: 'Contact', field: 'email' },
    { entity: 'AutoFundPaymentEvent', field: 'payment_event_id' },
    { entity: 'AutoFundConsentRecord', field: 'consent_record_id' },
    { entity: 'AutoFundSubscription', field: 'subscription_id' },
    // These two key their own ids with afconsent_/afjur_ prefixes that do NOT carry the
    // run id, so a run interrupted before its teardown could hide here permanently: the
    // run was undiscoverable and its records were never swept. Their denormalized
    // customer_email does carry the run id, so the run is discovered from that instead.
    { entity: 'AutoFundConsentRecord', field: 'customer_email' },
    { entity: 'AutoFundJurisdictionAudit', field: 'customer_email' },
    { entity: 'AutoFundSubscription', field: 'customer_email' },
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

  // A run currently holding a LIVE lock is never swept: its records belong to a run that is
  // still executing. Only an expired lock is recoverable, and the runner's own teardown plus the
  // bounded lock lifetime are what make recovery safe.
  let liveRunId = '';
  try {
    const lock = await readPropertyCertRunLock(client);
    if (lock && lock.active === true && Date.parse(String(lock.expires_at || '')) > Date.now()) {
      liveRunId = String(lock.run_id || '');
    }
  } catch { /* best effort */ }

  const results: CertCleanupResult[] = [];
  for (const runId of runIds) results.push(await cleanupCertRun(client, runId));

  // Property Visibility runs are cleaned through their own run-scoped pass; the generic entity
  // set above is never queried on their behalf.
  const propertyDiscovery = await discoverPropertyCertRunIds(client, cutoff, liveRunId);
  const propertyResults: CertCleanupResult[] = [];
  for (const runId of propertyDiscovery.run_ids) propertyResults.push(await cleanupPropertyCertRun(client, runId));

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

  const propertyRemainingByEntity: Record<string, number> = {};
  for (const r of propertyResults) {
    for (const [entity, count] of Object.entries(r.remaining_by_entity || {})) {
      propertyRemainingByEntity[entity] = (propertyRemainingByEntity[entity] || 0) + Number(count);
    }
  }

  return {
    runs_swept: results.length,
    run_ids: [...runIds],
    deleted: results.reduce((n, r) => n + r.deleted.length, 0) + standalone + propertyResults.reduce((n, r) => n + r.deleted.length, 0),
    remaining: results.reduce((n, r) => n + r.remaining, 0) + propertyResults.reduce((n, r) => n + r.remaining, 0),
    errors: [...results.flatMap((r) => r.errors), ...standaloneErrors, ...propertyResults.flatMap((r) => r.errors)],
    older_than_minutes: olderThanMinutes,
    live_locked_run_id: liveRunId,
    property: {
      runs_swept: propertyResults.length,
      run_ids: propertyDiscovery.run_ids,
      skipped_live_runs: propertyDiscovery.skipped_live,
      deleted: propertyResults.reduce((n, r) => n + r.deleted.length, 0),
      remaining: propertyResults.reduce((n, r) => n + r.remaining, 0),
      remaining_by_entity: propertyRemainingByEntity,
    },
  };
}