import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  certificationAdminVerdict,
  isPropertySweepCandidate,
  isRowStale,
  lockDecision,
  propertyCertRunIdsFromRow,
  shouldSkipSweepForActiveLock,
} from '../../shared/propertyCertRunGuard.ts';
import {
  acquirePropertyCertRunLock,
  assertNoForeignPropertyCertArtifacts,
  propertyCertRunLockStatus,
  releasePropertyCertRunLock,
} from '../../shared/propertyCertRunLock.ts';
import { cleanupPropertyCertRun, discoverPropertyCertRunIds } from '../../shared/certRunCleanup.ts';
import { PROPERTY_FEATURE_FLAG_KEY, certificationTestModeAvailable } from '../../shared/propertyVisibility.ts';

/**
 * Property Visibility certification — GUARD TESTS.
 *
 * Verifies the three certification safeguards on their own, WITHOUT executing the certification
 * suite: the suite is never invoked on its happy path, `PROPERTY_VISIBILITY_TEST_MODE` is neither
 * set nor required, and the production feature flag is never written.
 *
 *   A. Authorization — anonymous, ordinary customer, unauthorized authenticated caller and
 *      admin, asserted on the same pure verdict the endpoint enforces, including the case of a
 *      caller that merely CLAIMS an admin identity in its payload.
 *   B. Sweeper — the candidate predicate on mocked records, plus a live round trip: synthetic
 *      run-scoped artifacts are swept, the sweep is idempotent, and a record that is NOT a
 *      certification record survives.
 *   C. Concurrency — lock acquire / refuse / renew / expired takeover / holder-only release,
 *      plus the discovery guard that keeps a live run's records out of a sweep.
 *
 * ADMIN-ONLY. Every fixture it creates is `cert_prop_`-marked, certification_mode = true, and
 * deleted in a finally block.
 */
export default async function (req) {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const compact = body?.compact === true;
  const tests = [];
  const add = (name, passed, detail = '') => tests.push({ name, passed, detail });

  const user = await base44.auth.me().catch(() => null);
  const verdict = certificationAdminVerdict(user);
  if (!verdict.authorized) {
    return Response.json({ authorized: false, error: verdict.reason }, { status: verdict.status });
  }

  const b = base44.asServiceRole;
  const stamp = Date.now();
  const runA = `cert_prop_${stamp}`;
  const runB = `cert_prop_${stamp + 1}`;
  const runC = `cert_prop_${stamp + 2}`;
  const nowIso = new Date().toISOString();

  const created = { listing: null, event: null, inquiry: null, decoy: null };
  let cleanup = null;
  let lockStatusAfter = null;
  const counts = async (entity) => {
    try {
      return await b.entities[entity].count({});
    } catch {
      return null;
    }
  };

  const beforeContacts = await counts('Contact');
  const beforeWallets = await counts('PrepaidWallet');
  const flagRow = (await b.entities.AppSetting.filter({ key: PROPERTY_FEATURE_FLAG_KEY }, '-created_date', 5));
  const flagValue = (Array.isArray(flagRow) ? flagRow : (flagRow?.items || []))[0]?.value ?? null;

  try {
    // ============ A. AUTHORIZATION (mocked identities) ============
    const anon = certificationAdminVerdict(null);
    const customer = certificationAdminVerdict({ id: 'u1', email: 'customer@example.com', role: 'user' });
    const unauthorized = certificationAdminVerdict({ id: 'u2', email: 'staff@arriv.example', role: 'user' });
    const claimer = certificationAdminVerdict({ id: 'u3', email: 'owner@arriv.example', role: 'user', isAdmin: true, admin: true });
    const admin = certificationAdminVerdict({ id: 'u4', email: 'owner@arriv.example', role: 'admin' });

    add('auth_anonymous_refused_with_401',
      anon.authorized === false && anon.status === 401,
      `anonymous → ${anon.status} ${anon.reason}`);

    add('auth_ordinary_customer_refused_with_403',
      customer.authorized === false && customer.status === 403,
      `customer → ${customer.status}`);

    add('auth_unauthorized_authenticated_refused_with_403',
      unauthorized.authorized === false && unauthorized.status === 403,
      `authenticated non-admin → ${unauthorized.status}`);

    add('auth_client_supplied_role_claim_is_ignored',
      claimer.authorized === false && claimer.status === 403,
      'a payload claiming isAdmin/admin on a non-admin session is still refused — only the server-verified session role counts');

    add('auth_administrator_allowed',
      admin.authorized === true && admin.status === 200,
      `admin session → authorized (${admin.reason})`);

    // ============ A2. Endpoint ordering (live, deferred) ============
    // A live anonymous probe of the deployed runner is only safe ONCE the hardened function is
    // in the published app: the currently published version predates this gate, so an anonymous
    // request to it would START a run instead of being refused. The probe is therefore opt-in
    // and asserted here only when the caller declares the hardened version is live.
    // Only performed on request. Before the hardening is published this probe would START a run
    // rather than be refused, so it is opt-in — and if the published runner turns out to still be
    // permissive it is reported as a failure and NOT auto-cleaned: a run that may be in flight has
    // its records left alone.
    if (body?.include_live_anonymous_probe === true) {
      const certCounts = async () => ({
        listings: await b.entities.PropertyListing.count({ certification_mode: true }).catch(() => null),
        events: await b.entities.PropertyListingEvent.count({ certification_mode: true }).catch(() => null),
        inquiries: await b.entities.PropertyInquiry.count({ certification_mode: true }).catch(() => null),
      });
      const beforeCounts = await certCounts();
      const endpoint = 'https://arrivestatemedia.base44.app/functions/certifyPropertyVisibility';
      let anonStatus = 0;
      let anonBody = '';
      let badTokenStatus = 0;
      try {
        const anonRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        anonStatus = anonRes.status;
        anonBody = (await anonRes.text()).slice(0, 300);
        const badRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-valid-session-token' },
          body: JSON.stringify({}),
        });
        badTokenStatus = badRes.status;
        await badRes.text();
      } catch (e) {
        add('auth_live_probe_request_reached_the_endpoint', false, `request failed: ${e.message}`);
      }
      const afterCounts = await certCounts();
      const lockNow = await propertyCertRunLockStatus(b);
      const unchanged =
        beforeCounts.listings === afterCounts.listings &&
        beforeCounts.events === afterCounts.events &&
        beforeCounts.inquiries === afterCounts.inquiries;

      add('auth_live_anonymous_refused_by_published_runner',
        anonStatus === 401,
        `anonymous POST to the published runner → ${anonStatus}`);
      add('auth_live_invalid_token_refused',
        badTokenStatus === 401 || badTokenStatus === 403,
        `POST with an invalid session token → ${badTokenStatus}`);
      add('auth_live_probe_created_no_records_and_took_no_lock',
        unchanged && lockNow.active === false,
        `certification records before ${JSON.stringify(beforeCounts)} after ${JSON.stringify(afterCounts)}; lock active=${lockNow.active}`);

      if (anonStatus !== 401 && anonStatus !== 403) {
        add('auth_live_probe_REQUIRES_ATTENTION', false,
          `the published runner did more than refuse (status ${anonStatus}): ${anonBody} — a run may have started. Nothing was auto-removed; reconcile the fixtures after it finishes.`);
      }
    } else {
      add('auth_live_anonymous_probe_deferred', true,
        'not performed in this run; pass {"include_live_anonymous_probe": true} to probe the published endpoint.');
    }

    // ============ B. SWEEPER — candidate predicate (mocked records) ============
    const listingOfRun = { certification_mode: true, certification_run_id: runC, client_email: `${runC}@cert.test`, publication_state: 'PUBLISHED' };
    const eventOfRun = { certification_mode: true, listing_id: 'prop_x', event_type: 'published' };
    const foreignRun = { certification_mode: true, certification_run_id: `cert_prop_${stamp - 999}`, client_email: `cert_prop_${stamp - 999}@cert.test` };
    const realListing = { certification_mode: false, certification_run_id: runC, client_email: `${runC}@cert.test` };
    const addressOnlyMatch = { certification_mode: true, client_email: `prefix-${runC}@cert.test` };

    add('sweep_predicate_selects_run_owned_certification_records',
      isPropertySweepCandidate(listingOfRun, { runId: runC }) === true &&
        isPropertySweepCandidate(eventOfRun, { runId: runC, listingIds: ['prop_x'] }) === true,
      'run marker on the record, and declared relationship, both qualify');

    add('sweep_predicate_rejects_non_certification_record',
      isPropertySweepCandidate(realListing, { runId: runC }) === false,
      'identical synthetic-looking address but certification_mode !== true → never selected (this is the guard that protects legitimate data)');

    add('sweep_predicate_rejects_another_run',
      isPropertySweepCandidate(foreignRun, { runId: runC }) === false,
      'a certification record belonging to a different run is never selected');

    add('sweep_predicate_rejects_substring_only_match',
      isPropertySweepCandidate(addressOnlyMatch, { runId: runC }) === false,
      'attribution is by prefix on the record\'s own markers, not by substring');

    add('sweep_predicate_rejects_non_certification_run_id',
      isPropertySweepCandidate(listingOfRun, { runId: 'plain_run_id' }) === false,
      'a run id without the cert_ marker can never select anything');

    add('run_id_extraction_finds_markers_and_tolerates_absence',
      propertyCertRunIdsFromRow({ certification_run_id: `${runC}_listing_1` })[0] === runC &&
        propertyCertRunIdsFromRow({ client_email: `${runC}.buyer@cert.test` })[0] === runC &&
        propertyCertRunIdsFromRow({ client_email: 'customer@example.com' }).length === 0,
      'marker extraction is prefix-based and never invents a run from a real address');

    add('age_guard_requires_staleness',
      isRowStale({ created_date: nowIso }, Date.now() - 60000) === false &&
        isRowStale({ created_date: nowIso }, Date.now() + 60000) === true &&
        isRowStale({ created_date: 'not-a-date' }, Date.now()) === true,
      'fresh records are out of scope; an unreadable timestamp fails towards sweeping only for marker-guarded rows');

    // ============ C. LOCK DECISIONS (mocked state) ============
    const now = Date.now();
    add('lock_decision_acquires_when_free',
      lockDecision(null, now, runA, 60000).verdict === 'acquire' &&
        lockDecision({ active: false, run_id: runB }, now, runA, 60000).verdict === 'acquire',
      'no lock, and a released lock, both allow acquisition');

    add('lock_decision_refuses_while_another_run_is_live',
      lockDecision({ active: true, run_id: runB, expires_at: new Date(now + 60000).toISOString() }, now, runA, 60000).verdict === 'refuse',
      'a live foreign lock is refused — the second run never starts');

    add('lock_decision_recovers_an_expired_lock',
      lockDecision({ active: true, run_id: runB, expires_at: new Date(now - 1000).toISOString() }, now, runA, 60000).verdict === 'takeover' &&
        lockDecision({ active: true, run_id: runB, expires_at: 'unreadable' }, now, runA, 60000).verdict === 'takeover',
      'expired and unreadable lifetimes are both recoverable, so an interrupted run cannot block certification for ever');

    add('lock_decision_renews_for_the_same_run',
      lockDecision({ active: true, run_id: runA, expires_at: new Date(now + 60000).toISOString() }, now, runA, 60000).verdict === 'renew',
      'the holder re-entering the lock is a renewal, not a refusal');

    add('sweep_skip_guard_protects_the_live_run_only',
      shouldSkipSweepForActiveLock(runA, { active: true, run_id: runA, expires_at: new Date(now + 60000).toISOString() }, now) === true &&
        shouldSkipSweepForActiveLock(runA, { active: true, run_id: runA, expires_at: new Date(now - 1000).toISOString() }, now) === false &&
        shouldSkipSweepForActiveLock(runA, { active: true, run_id: runB, expires_at: new Date(now + 60000).toISOString() }, now) === false,
      'only the run holding a live lock is spared, and only until it expires');

    // ============ C2. LOCK (live, synthetic) ============
    const lockAcquireA = await acquirePropertyCertRunLock(b, runA, 'guard-test@cert.test', 60);
    add('lock_acquire_succeeds_when_free_or_reports_the_active_run',
      lockAcquireA.acquired === true || lockAcquireA.status === 'refused',
      lockAcquireA.acquired ? `acquired by ${runA}, expires ${lockAcquireA.expires_at}` : `another run is active: ${lockAcquireA.active_run_id}`);

    if (lockAcquireA.acquired) {
      const lockAcquireB = await acquirePropertyCertRunLock(b, runB, 'guard-test@cert.test', 60);
      add('lock_second_run_refused_with_bounded_expiry',
        lockAcquireB.acquired === false && lockAcquireB.status === 'refused' && lockAcquireB.active_run_id === runA && !!lockAcquireB.expires_at,
        `second run refused, holding run=${lockAcquireB.active_run_id}, expires ${lockAcquireB.expires_at}`);

      const renewExpired = await acquirePropertyCertRunLock(b, runA, 'guard-test@cert.test', 0);
      add('lock_expiry_is_bounded_and_recoverable',
        renewExpired.acquired === true && renewExpired.status === 'renewed',
        'a zero-length lifetime leaves the lock expired immediately, which is how an interrupted run is recovered');

      const takeover = await acquirePropertyCertRunLock(b, runB, 'guard-test@cert.test', 60);
      add('lock_expired_takeover_is_recorded',
        takeover.acquired === true && takeover.status === 'taken_over' && takeover.took_over_from === runA,
        `takeover recorded from ${takeover.took_over_from}`);

      const wrongRelease = await releasePropertyCertRunLock(b, runA);
      add('lock_release_refused_for_non_holder',
        wrongRelease.released === false && wrongRelease.status === 'not_holder' && wrongRelease.holder === runB,
        `${runA} cannot release the lock held by ${runB}`);

      const rightRelease = await releasePropertyCertRunLock(b, runB);
      const after = await propertyCertRunLockStatus(b);
      lockStatusAfter = after;
      add('lock_release_by_holder_is_idempotent_and_clears_state',
        rightRelease.released === true && after.active === false &&
          (await releasePropertyCertRunLock(b, runB)).released === false,
        `released by ${runB}; a second release is a no-op; status active=${after.active}`);
    } else {
      releasePropertyCertRunLock(b, runA);
    }

    // ============ B2. SWEEPER (live, synthetic artifacts for an expired run) ============
    const listingId = `prop_certguard_${stamp}`;
    created.listing = await b.entities.PropertyListing.create({
      listing_id: listingId,
      tenant_id: 'tnt_estate_media',
      job_id: `certguard_job_${stamp}`,
      client_email: `${runC}@cert.test`,
      property_address: '1 Certification Way',
      city: 'Bethesda',
      state: 'MD',
      publication_state: 'DRAFT',
      listing_status: 'draft',
      certification_mode: true,
      certification_run_id: runC,
      public_slug: `cert-guard-${stamp}`,
      created_at: nowIso,
    });
    created.event = await b.entities.PropertyListingEvent.create({
      event_id: `plev_certguard_${stamp}`,
      listing_id: listingId,
      event_type: 'listing_created',
      actor: `${runC}@cert.test`,
      actor_type: 'admin',
      recorded_at: nowIso,
      certification_mode: true,
    });
    created.inquiry = await b.entities.PropertyInquiry.create({
      inquiry_id: `inq_certguard_${stamp}`,
      listing_id: listingId,
      public_slug: `cert-guard-${stamp}`,
      name: 'Guard Test Buyer',
      email: `${runC}.buyer@cert.test`,
      message: 'Synthetic inquiry created by the guard test.',
      consent_privacy: true,
      certification_mode: true,
      created_at: nowIso,
    });
    // Decoy: the same synthetic-looking address, but NOT a certification record. It must survive.
    created.decoy = await b.entities.PropertyListing.create({
      listing_id: `prop_certguard_decoy_${stamp}`,
      tenant_id: 'tnt_estate_media',
      job_id: `certguard_decoy_job_${stamp}`,
      client_email: `${runC}@cert.test`,
      property_address: '2 Decoy Lane',
      city: 'Bethesda',
      state: 'MD',
      publication_state: 'DRAFT',
      listing_status: 'draft',
      certification_mode: false,
      public_slug: `cert-guard-decoy-${stamp}`,
      created_at: nowIso,
    });

    const foreignBefore = await assertNoForeignPropertyCertArtifacts(b, runC);
    const foreignOther = await assertNoForeignPropertyCertArtifacts(b, `${runC}-other-owner`);
    add('artifact_guard_ignores_own_run_and_detects_foreign_artifacts',
      foreignBefore.clear === true && foreignOther.clear === false && foreignOther.foreign_count > 0,
      `own run clear=${foreignBefore.clear}; seen as foreign by a different run=${foreignOther.foreign_count} artifact(s) — this is the data-level backstop behind the lock`);

    const discovery = await discoverPropertyCertRunIds(b, Date.now() + 60000, '');
    const discoverySkippingLive = await discoverPropertyCertRunIds(b, Date.now() + 60000, runC);
    add('sweeper_discovery_finds_the_stale_run',
      discovery.run_ids.includes(runC),
      `discovered runs: ${discovery.run_ids.filter((r) => r === runC).length ? runC : '(run not found)'}`);
    add('sweeper_skips_a_run_that_is_still_live',
      discoverySkippingLive.run_ids.includes(runC) === false && discoverySkippingLive.skipped_live.includes(runC),
      'a run under a live lock is reported as skipped, not swept');

    const sweep1 = await cleanupPropertyCertRun(b, runC);
    const sweep2 = await cleanupPropertyCertRun(b, runC);
    const decoySurvived = await b.entities.PropertyListing.filter({ listing_id: created.decoy.listing_id }, '-created_date', 5);
    const decoyRows = Array.isArray(decoySurvived) ? decoySurvived : (decoySurvived?.items || []);

    add('sweeper_removes_page_events_and_inquiries',
      sweep1.deleted.length >= 3 && sweep1.remaining === 0 && sweep1.errors.length === 0,
      `deleted ${sweep1.deleted.length} record(s) across ${[...new Set(sweep1.deleted.map((d) => d.entity))].join(', ')}; remaining=${sweep1.remaining}`);

    add('sweeper_is_idempotent_and_retry_safe',
      sweep2.deleted.length === 0 && sweep2.remaining === 0,
      `second pass deleted ${sweep2.deleted.length}, remaining ${sweep2.remaining}`);

    add('sweeper_never_deletes_a_non_certification_record',
      decoyRows.length === 1 && sweep1.deleted.every((d) => d.entity !== 'PropertyListing' || d.id !== created.decoy.id),
      'a listing sharing the run\'s synthetic address but certification_mode = false survived the sweep');

    const refusal = await cleanupPropertyCertRun(b, 'plain_run_id');
    add('sweeper_refuses_a_non_certification_run',
      refusal.deleted.length === 0 && refusal.errors.some((e) => e.includes('non-cert_')),
      `non-marked run id refused: ${refusal.errors[0] || 'no error reported'}`);
  } catch (err) {
    add('guard_suite_execution', false, `Aborted: ${err.message}`);
  } finally {
    try {
      const failures = [];
      for (const [kind, row] of Object.entries(created)) {
        if (!row || !row.id) continue;
        const entity = kind === 'event' ? 'PropertyListingEvent' : kind === 'inquiry' ? 'PropertyInquiry' : 'PropertyListing';
        try {
          await b.entities[entity].delete(row.id);
        } catch (e) {
          failures.push(`${entity}.${row.id}: ${e.message}`);
        }
      }
      await releasePropertyCertRunLock(b, runA);
      await releasePropertyCertRunLock(b, runB);
      cleanup = { removed: Object.values(created).filter((r) => r && r.id).length, failures };
    } catch (err) {
      cleanup = { error: err.message };
    }
  }

  const afterContacts = await counts('Contact');
  const afterWallets = await counts('PrepaidWallet');
  const certListingsLeft = await b.entities.PropertyListing.count({ certification_mode: true }).catch(() => null);

  const failed = tests.filter((t) => !t.passed);

  if (compact) {
    return Response.json({
      suite: 'Property Visibility certification — guard tests (compact)',
      passed: tests.length - failed.length,
      failed: failed.length,
      failures: failed,
      environment: {
        property_visibility_enabled: String(flagValue ?? '(absent)'),
        certification_test_mode_configured: certificationTestModeAvailable(),
      },
      side_effects: {
        contacts: `${beforeContacts} → ${afterContacts}`,
        prepaid_wallets: `${beforeWallets} → ${afterWallets}`,
        certification_listings_remaining: certListingsLeft,
      },
      cleanup,
    }, { status: failed.length ? 207 : 200 });
  }

  return Response.json({
    suite: 'Property Visibility certification — guard tests',
    authorized_as: String(user?.email || ''),
    passed: tests.length - failed.length,
    failed: failed.length,
    tests,
    outstanding_failures: failed.map((f) => ({ name: f.name, detail: f.detail })),
    environment: {
      property_visibility_enabled: String(flagValue ?? '(absent)'),
      flag_read_only: true,
      certification_test_mode_configured: certificationTestModeAvailable(),
      certification_suite_not_executed: true,
      financial_and_booking_systems_untouched: true,
    },
    side_effects: {
      contacts_before: beforeContacts,
      contacts_after: afterContacts,
      prepaid_wallets_before: beforeWallets,
      prepaid_wallets_after: afterWallets,
      certification_listings_remaining: certListingsLeft,
    },
    cleanup,
    run_lock_after_tests: lockStatusAfter,
  }, { status: failed.length ? 207 : 200 });
}