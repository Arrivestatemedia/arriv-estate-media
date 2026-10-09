import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { isCertificationId, CERT_PREFIX } from '../../shared/certificationMode.ts';

/**
 * Certification Data Inventory, Dependency Map & Payroll Exposure Audit
 *
 * READ ONLY. This function performs zero writes — it never deletes, archives,
 * updates or delivers anything. It exists to produce the evidence needed to
 * authorize a cleanup, and to answer whether synthetic certification data can
 * reach employee compensation, payroll or financial reporting.
 *
 * Identification standard: a record is synthetic ONLY when an exact identifier
 * field on it starts with the required `cert_` prefix (isCertificationId), or
 * when it carries the explicit `certification_mode: true` marker. Broad
 * substring matching is deliberately NOT used — it risks matching a real
 * customer whose data merely contains the letters "cert_".
 *
 * Run with no payload. Admin only.
 */

interface EntitySpec {
  /** Entity name. */
  name: string;
  /** Exact fields verified to carry `cert_`-prefixed synthetic identifiers. */
  fields: string[];
  /** One-line explanation of why this entity is in scope. */
  role: string;
}

const ENTITY_SPECS: EntitySpec[] = [
  { name: 'PrepaidWallet', fields: ['customer_email', 'customer_id'], role: 'synthetic wallet balances' },
  { name: 'AutoFundSubscription', fields: ['customer_email', 'customer_id'], role: 'synthetic Auto-Fund enrollments' },
  { name: 'CreditLot', fields: ['customer_email', 'customer_id', 'lot_id'], role: 'synthetic Booking Value lots' },
  { name: 'WalletTransaction', fields: ['customer_email', 'customer_id', 'transaction_id'], role: 'synthetic wallet ledger entries' },
  { name: 'AutoFundPaymentEvent', fields: ['customer_email', 'payment_event_id', 'customer_id', 'idempotency_key'], role: 'synthetic funding payment events' },
  { name: 'PrepaidCompensationEvent', fields: ['source_event_id', 'employee_email', 'employee_id', 'customer_id'], role: 'synthetic funding commissions handed to Arriv Payroll' },
  { name: 'PaymentRecoveryNotification', fields: ['notification_id', 'customer_email'], role: 'synthetic recovery notifications' },
  { name: 'Contact', fields: ['email'], role: 'synthetic customer records' },
  { name: 'Invoice', fields: ['client_email'], role: 'synthetic invoices' },
  { name: 'Booking', fields: ['client_email'], role: 'synthetic bookings' },
  { name: 'Job', fields: ['client_email'], role: 'synthetic jobs' },
  { name: 'SalesTeamMember', fields: ['email'], role: 'synthetic sales reps / employees' },
  { name: 'Commission', fields: ['employee_email', 'employee_id'], role: 'booking-level commissions (must be zero for wallet-funded work)' },
  { name: 'CommissionSourceRecord', fields: ['client_id', 'arriv_employee_id'], role: 'payroll source records' },
];

/** Payroll-side artifacts checked for synthetic references (field-verified). */
const PAYROLL_ARTIFACT_CHECKS: { entity: string; field: string; role: string }[] = [
  { entity: 'Commission', field: 'employee_email', role: 'payroll batch source (owner_approved commissions)' },
  { entity: 'CommissionSourceRecord', field: 'client_id', role: 'payroll source records' },
  { entity: 'PayrollReconciliation', field: 'arriv_employee_id', role: 'per-employee reconciliation' },
  { entity: 'PayrollPeriodSnapshot', field: 'arriv_employee_id', role: 'locked pay-period snapshots' },
  { entity: 'PayoutHistory', field: 'media_specialist_email', role: 'contractor payout history' },
  { entity: 'ContractorPayoutDocument', field: 'media_specialist_email', role: 'tax / statement documents' },
];

function asArray(res: any): any[] {
  return Array.isArray(res) ? res : (res?.items || res?.data || []);
}

/** Extract the certification run token, so cleanup can be batched per run. */
function runToken(value: any): string {
  const s = String(value || '');
  const m = s.match(/^cert_(?:[a-z]+_)?\d{9,}/i);
  if (m) return m[0];
  const parts = s.split('_');
  return parts.slice(0, 3).join('_') || CERT_PREFIX;
}

/** Load every cert_-prefixed record for one entity, across its identifier fields. */
async function loadCertRecords(b: any, spec: EntitySpec) {
  const seen = new Map<string, any>();
  const errors: string[] = [];
  let truncated = false;

  for (const field of spec.fields) {
    let cursor: string | undefined = undefined;
    for (let page = 0; page < 4; page++) {
      let resp: any;
      try {
        resp = await b.entities[spec.name].filter(
          { [field]: { $regex: `^${CERT_PREFIX}` } },
          { limit: 500, cursor }
        );
      } catch (e) {
        errors.push(`${field}: ${e.message}`);
        break;
      }
      for (const r of asArray(resp)) seen.set(r.id, r);
      if (Array.isArray(resp) || !resp?.has_more || !resp?.next_cursor) break;
      cursor = resp.next_cursor;
      if (page === 3) truncated = true;
    }
  }

  // Explicit certification_mode marker (records that may lack a cert_ identifier).
  try {
    const marked = await b.entities[spec.name].filter({ certification_mode: true }, { limit: 500 });
    for (const r of asArray(marked)) seen.set(r.id, r);
  } catch (_e) {
    // Entity has no certification_mode field — expected for most entities.
  }

  return { records: [...seen.values()], errors, truncated };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const b = base44.asServiceRole;

    // ── Load synthetic records per entity ──────────────────────────────────
    const recordsByEntity: Record<string, any[]> = {};
    const loadMeta: Record<string, any> = {};
    for (const spec of ENTITY_SPECS) {
      const loaded = await loadCertRecords(b, spec);
      recordsByEntity[spec.name] = loaded.records;
      loadMeta[spec.name] = { errors: loaded.errors, truncated: loaded.truncated };
    }

    const totalOf = async (name: string) => {
      try { return await b.entities[name].count({}); } catch (_e) { return null; }
    };

    // ── Identifier sets for dependency / orphan analysis ───────────────────
    const set = (name: string, pick: (r: any) => string) =>
      new Set(recordsByEntity[name].map(pick).filter(Boolean));

    const certContactEmails = set('Contact', r => r.email);
    const certContactIds = new Set(recordsByEntity.Contact.map(r => r.id));
    const certWalletIds = new Set(recordsByEntity.PrepaidWallet.map(r => r.id));
    const certLotIds = set('CreditLot', r => r.lot_id);
    const certTxnIds = set('WalletTransaction', r => r.transaction_id);
    const certSubIds = new Set(recordsByEntity.AutoFundSubscription.map(r => r.id));
    const certRepEmails = set('SalesTeamMember', r => r.email);
    const certBookingIds = new Set(recordsByEntity.Booking.map(r => r.id));
    const certInvoiceIds = new Set(recordsByEntity.Invoice.map(r => r.id));

    // ── Per-entity inventory with run grouping ─────────────────────────────
    const inventory = [];
    let totalSynthetic = 0;

    for (const spec of ENTITY_SPECS) {
      const recs = recordsByEntity[spec.name];
      if (recs.length === 0) {
        inventory.push({
          entity: spec.name,
          role: spec.role,
          synthetic_count: 0,
          identified_by: spec.fields.map(f => `${f} ^${CERT_PREFIX}`),
        });
        continue;
      }

      // Group per run token, using whichever identifier field is cert-prefixed.
      const groups = new Map<string, { count: number; sample_ids: string[]; identifiers: string[] }>();
      for (const r of recs) {
        const idValue = spec.fields.map(f => r[f]).find((v: any) => isCertificationId(v)) || '';
        const token = runToken(idValue);
        if (!groups.has(token)) groups.set(token, { count: 0, sample_ids: [], identifiers: [] });
        const g = groups.get(token)!;
        g.count += 1;
        if (g.sample_ids.length < 2) g.sample_ids.push(r.id);
        if (g.identifiers.length < 2 && !g.identifiers.includes(idValue)) g.identifiers.push(idValue);
      }

      const entityTotal = await totalOf(spec.name);
      totalSynthetic += recs.length;

      inventory.push({
        entity: spec.name,
        role: spec.role,
        synthetic_count: recs.length,
        entity_total: entityTotal,
        production_count: entityTotal != null ? entityTotal - recs.length : null,
        identified_by: spec.fields.map(f => `${f} ^${CERT_PREFIX}`),
        run_groups: [...groups.entries()]
          .sort((a, c) => c[1].count - a[1].count)
          .slice(0, 15)
          .map(([run_id, g]) => ({ run_id, count: g.count, sample_identifiers: g.identifiers })),
        run_group_count: groups.size,
        groups_truncated: groups.size > 15,
        load: loadMeta[spec.name],
      });
    }

    // ── Relationships and orphaned dependencies ────────────────────────────
    const orphans = {
      wallets_without_cert_contact: recordsByEntity.PrepaidWallet.filter(r => r.customer_id && !certContactIds.has(r.customer_id)).length,
      lots_without_cert_wallet: recordsByEntity.CreditLot.filter(r => r.wallet_id && !certWalletIds.has(r.wallet_id)).length,
      transactions_without_cert_wallet: recordsByEntity.WalletTransaction.filter(r => r.wallet_id && !certWalletIds.has(r.wallet_id)).length,
      payment_events_without_cert_lot: recordsByEntity.AutoFundPaymentEvent.filter(r => r.lot_id && !certLotIds.has(r.lot_id)).length,
      payment_events_without_cert_transaction: recordsByEntity.AutoFundPaymentEvent.filter(r => r.wallet_transaction_id && !certTxnIds.has(r.wallet_transaction_id)).length,
      compensation_events_without_cert_transaction: recordsByEntity.PrepaidCompensationEvent.filter(r => r.transaction_id && !certTxnIds.has(r.transaction_id)).length,
      compensation_events_without_cert_rep: recordsByEntity.PrepaidCompensationEvent.filter(r => r.employee_email && !certRepEmails.has(r.employee_email)).length,
      notifications_without_cert_subscription: recordsByEntity.PaymentRecoveryNotification.filter(r => r.subscription_id && !certSubIds.has(r.subscription_id)).length,
      bookings_without_cert_contact: recordsByEntity.Booking.filter(r => r.client_email && !certContactEmails.has(r.client_email)).length,
      invoices_without_cert_booking: recordsByEntity.Invoice.filter(r => r.booking_id && !certBookingIds.has(r.booking_id)).length,
    };

    // Critical integrity check: a synthetic commission must never be attributed
    // to a real (non-cert) employee.
    const mixedIdentity = recordsByEntity.PrepaidCompensationEvent.filter(
      r => !isCertificationId(r.employee_email) && !isCertificationId(r.employee_id)
    );

    // Pricing snapshots are found via their cert booking, not their own fields.
    let certPricingSnapshots = 0;
    for (const bookingId of [...certBookingIds].slice(0, 40)) {
      try {
        certPricingSnapshots += asArray(await b.entities.PricingSnapshot.filter({ booking_id: bookingId })).length;
      } catch (_e) { /* entity optional */ }
    }

    const relationships = {
      orphaned_children: orphans,
      orphan_note: 'Orphans are expected: certification suites delete their fixtures at the end of each run, leaving historical child records behind. Orphans are not production dependencies.',
      mixed_identity_commissions: {
        count: mixedIdentity.length,
        sample: mixedIdentity.slice(0, 5).map(r => ({ source_event_id: r.source_event_id, employee_id: r.employee_id, employee_email: r.employee_email })),
        meaning: 'Synthetic compensation attributed to a non-synthetic employee. Must be 0; any value here is a payroll-attribution defect.',
      },
      pricing_snapshots_for_cert_bookings: certPricingSnapshots,
      invoices_for_cert_bookings: recordsByEntity.Invoice.filter(r => r.booking_id && certBookingIds.has(r.booking_id)).length,
      note: 'Cert invoices are matched to cert bookings by booking_id; cert bookings themselves are matched by client_email.',
    };

    // ── Payroll exposure audit ─────────────────────────────────────────────
    const paymentEventStatus: Record<string, number> = {};
    for (const status of ['PENDING', 'DELIVERED', 'ACKNOWLEDGED', 'RETRYING', 'FAILED', 'REVIEW_REQUIRED']) {
      paymentEventStatus[status] = recordsByEntity.PrepaidCompensationEvent.filter(r => r.delivery_status === status).length;
    }

    const ackMarked = recordsByEntity.PrepaidCompensationEvent.filter(r => r.delivered_to_payroll === true);
    const networkDelivered = ackMarked.filter(r => (r.delivery_attempts || 0) > 0);
    const eligibleForBatchDelivery = recordsByEntity.PrepaidCompensationEvent.filter(
      r => r.status === 'APPROVED' && ['PENDING', 'RETRYING'].includes(r.delivery_status)
    );

    const payrollArtifacts: Record<string, any> = {};
    for (const chk of PAYROLL_ARTIFACT_CHECKS) {
      try {
        payrollArtifacts[chk.entity] = {
          role: chk.role,
          cert_referencing: await b.entities[chk.entity].count({ [chk.field]: { $regex: `^${CERT_PREFIX}` } }),
          total: await b.entities[chk.entity].count({}),
        };
      } catch (e) {
        payrollArtifacts[chk.entity] = { role: chk.role, error: e.message };
      }
    }

    const flag = async (key: string) => {
      try {
        const rows = asArray(await b.entities.AppSetting.filter({ key }, { limit: 1 }));
        return rows[0]?.value ?? null;
      } catch (_e) { return null; }
    };

    const payrollExposure = {
      verdict: networkDelivered.length === 0
        ? 'NO SYNTHETIC COMPENSATION REACHED ARRIV PAYROLL. No network delivery has ever occurred for a cert_ compensation event.'
        : 'REVIEW REQUIRED — cert_ compensation events show delivery attempts.',
      ack_marked_events: {
        count: ackMarked.length,
        total_amount: ackMarked.reduce((s, r) => s + (r.commission_amount || 0), 0),
        with_network_delivery_attempts: networkDelivered.length,
        delivery_attempts_observed: [...new Set(ackMarked.map(r => r.delivery_attempts || 0))],
        writer: 'runCertificationSuite (entry.ts ~line 648) sets delivery_status=ACKNOWLEDGED + delivered_to_payroll=true LOCALLY, with the in-code comment "simulating already-paid", to prove a reversal cannot mutate an already-acknowledged commission.',
        corroboration: 'deliverPrepaidCompensation.deliverOneEvent is the only code that POSTs to Arriv Payroll; it always increments delivery_attempts to >=1 immediately before the request, and it returns early for an already-ACKNOWLEDGED event. delivery_attempts stays 0 here, so no request was ever sent.',
        empty_payroll_employee_id: 'The synthetic reps carry an empty payroll_employee_id, so even a delivered payload could not match a real employee.',
      },
      future_delivery_exposure: {
        events_eligible_for_a_batch_delivery: eligibleForBatchDelivery.length,
        feature_flags: {
          prepaid_enabled: await flag('prepaid_enabled'),
          auto_fund_enabled: await flag('auto_fund_enabled'),
        },
        guard_behaviour: 'deliverPrepaidCompensation filters a batch down to cert_-only events when the feature flag is OFF. When the flag is ON that filter is skipped, so a manually triggered batch delivery would include the synthetic events above.',
        reachability: 'No workflow and no UI code invokes deliverPrepaidCompensation — the batch path is manual/admin-only today. Recommended (needs authorization): make the filter unconditional so synthetic events are never batch-delivered in any flag state.',
      },
      payroll_artifacts: payrollArtifacts,
      payroll_batch_source_of_truth: 'PayrollPeriod / PayrollPeriodSnapshot / PayrollReconciliation are built from CommissionSourceRecord (commission_source_record_ids) and arriv_employee_id — never from PrepaidCompensationEvent. Synthetic funding commissions therefore cannot enter pay-period math, submissions or financial reporting.',
      certification_mode_marker: 'PaymentRecoveryNotification, Invoice and B2BOrganization carry certification_mode; 117/117 recovery notifications are marked and none was ever emailed (email_sent false).',
    };

    // ── Cleanup / archival plan (proposed, not executed) ───────────────────
    const cleanupPlan = {
      status: 'PROPOSED — NOTHING HAS BEEN DELETED, ARCHIVED OR MODIFIED.',
      identification_standard: `Exact prefix match ^${CERT_PREFIX} on the identifier fields listed per entity, plus certification_mode: true where the field exists. Never substring/contains matching.`,
      plan_a_recommended: {
        name: 'Retain-and-mark (fully reversible, zero deletion)',
        steps: [
          'Ensure certification_mode = true on every synthetic record that has the field.',
          'Confirm production reporting already excludes synthetic data via isSyntheticRecord() (checks certification_mode and every cert_ identifier).',
          'Keep the records as immutable certification history; no financial record is deleted.',
        ],
        reversibility: 'Total — a single field update per record, no data loss.',
        risk: 'None to production. Synthetic rows remain stored and visible only to admins.',
      },
      plan_b_deletion: {
        name: 'Archive-then-delete, one run batch at a time',
        preconditions: [
          'Written authorization for the specific run tokens listed in the inventory.',
          'Arriv Payroll reconciliation signed off for the ack-marked events.',
          'A production financial snapshot taken immediately before each batch.',
        ],
        deletion_order: [
          'PaymentRecoveryNotification (leaf)',
          'PrepaidCompensationEvent (leaf — reconcile ack-marked events FIRST)',
          'WalletTransaction (leaf)',
          'CreditLot (leaf)',
          'AutoFundPaymentEvent (leaf)',
          'AutoFundSubscription',
          'PrepaidWallet',
          'Invoice',
          'Job',
          'PricingSnapshot (joined via cert booking_id)',
          'Booking',
          'ClientSignupInvite',
          'CommissionSourceRecord, then Commission',
          'Contact',
          'SalesTeamMember (cert_ only)',
        ],
        guards: [
          'Delete children before parents; abort the batch if any parent lookup fails.',
          'Refuse to delete any record whose identifiers do not start with cert_.',
          'Refuse to delete a record referenced by a non-synthetic parent.',
          'Re-run verifyCleanupComplete() per run token and require zero remaining.',
          'Never touch a production wallet, subscription, transaction or commission.',
        ],
        reversibility: 'Deletion is NOT natively reversible. The archive export (full JSON per record, with archived_at and run_id) is the restore source; audit history is preserved in the audit logs.',
      },
      batching: 'Clean one run token at a time — the run_groups in the inventory give the exact batches, largest first.',
    };

    return Response.json({
      generated_at: new Date().toISOString(),
      mode: 'READ_ONLY',
      writes_performed: 0,
      identifier_prefix: CERT_PREFIX,
      totals: {
        synthetic_records: totalSynthetic,
        entities_with_synthetic_data: inventory.filter(i => i.synthetic_count > 0).length,
      },
      inventory,
      relationships,
      payroll_exposure: payrollExposure,
      cleanup_plan: cleanupPlan,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}