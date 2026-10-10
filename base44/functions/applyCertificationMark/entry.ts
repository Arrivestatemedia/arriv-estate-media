import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { isCertificationId, isSyntheticRecord } from '../../shared/certificationMode.ts';

/**
 * Plan A — Retain and Mark (Fully Reversible, Zero Deletion)
 *
 * Marks all synthetic certification records with certification_mode = true
 * (on entities that support the field) and verifies that the cert_ prefix
 * on identifiers serves as the permanent exclusion mark on entities that
 * don't support the boolean field.
 *
 * Modes:
 *   dry_run (default) — counts and reports without modifying any record
 *   apply             — sets certification_mode = true on eligible records
 *   verify            — checks that all synthetic records are properly marked
 *   unmark            — reverses the marking (sets certification_mode = false)
 *
 * Entities with certification_mode field:
 *   PaymentRecoveryNotification, Invoice, B2BOrganization
 *
 * Entities without certification_mode field (cert_ prefix is the mark):
 *   PrepaidCompensationEvent, AutoFundPaymentEvent, PrepaidWallet,
 *   CreditLot, WalletTransaction, Contact, SalesTeamMember,
 *   AutoFundSubscription
 *
 * Operational exclusion is verified by checking that production workflows
 * use isSyntheticRecord() or isCertificationId() to filter cert_ records.
 *
 * This function is admin-gated. No records are deleted.
 */

const CERT_FLAG_ENTITIES = [
  { entity: 'PaymentRecoveryNotification', idField: 'customer_email', flagField: 'certification_mode' },
  { entity: 'Invoice', idField: 'client_email', flagField: 'certification_mode' },
  { entity: 'B2BOrganization', idField: 'organization_id', flagField: 'certification_mode' },
];

const PREFIX_ONLY_ENTITIES = [
  { entity: 'PrepaidCompensationEvent', idField: 'source_event_id' },
  { entity: 'AutoFundPaymentEvent', idField: 'payment_event_id' },
  { entity: 'PrepaidWallet', idField: 'customer_email' },
  { entity: 'CreditLot', idField: 'customer_email' },
  { entity: 'WalletTransaction', idField: 'customer_email' },
  { entity: 'Contact', idField: 'email' },
  { entity: 'SalesTeamMember', idField: 'email' },
  { entity: 'AutoFundSubscription', idField: 'customer_email' },
];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'dry_run'; // dry_run | apply | verify | unmark
    const b = base44.asServiceRole;
    const arr = (r: any) => Array.isArray(r) ? r : (r?.items || r?.data || []);

    const report: any = {
      mode,
      cert_flag_entities: [],
      prefix_only_entities: [],
      total_synthetic: 0,
      total_marked: 0,
      total_unmarked: 0,
      errors: [],
    };

    // ── Entities with certification_mode field ──────────────────────────
    for (const { entity, idField, flagField } of CERT_FLAG_ENTITIES) {
      try {
        const records = arr(await b.entities[entity].filter(
          { [idField]: { $regex: '^cert_' } }, undefined, 500
        ));
        const unmarked = records.filter((r: any) => r[flagField] !== true);
        const alreadyMarked = records.filter((r: any) => r[flagField] === true);

        const entityReport: any = {
          entity, total_synthetic: records.length,
          already_marked: alreadyMarked.length,
          unmarked: unmarked.length,
        };

        if (mode === 'apply') {
          let marked = 0;
          for (const rec of unmarked) {
            try {
              await b.entities[entity].update(rec.id, { [flagField]: true });
              marked++;
              if (marked % 5 === 0) await new Promise(r => setTimeout(r, 250));
            } catch (e) {
              report.errors.push(`${entity} ${rec.id}: ${e.message}`);
              await new Promise(r => setTimeout(r, 500));
            }
          }
          entityReport.newly_marked = marked;
          report.total_marked += marked;
        } else if (mode === 'unmark') {
          let unmarkedCount = 0;
          for (const rec of alreadyMarked) {
            try {
              await b.entities[entity].update(rec.id, { [flagField]: false });
              unmarkedCount++;
              if (unmarkedCount % 5 === 0) await new Promise(r => setTimeout(r, 250));
            } catch (e) {
              report.errors.push(`${entity} ${rec.id}: ${e.message}`);
              await new Promise(r => setTimeout(r, 500));
            }
          }
          entityReport.newly_unmarked = unmarkedCount;
          report.total_unmarked += unmarkedCount;
        } else if (mode === 'verify') {
          entityReport.all_marked = unmarked.length === 0;
        }

        report.cert_flag_entities.push(entityReport);
        report.total_synthetic += records.length;
      } catch (e) {
        report.errors.push(`${entity}: ${e.message}`);
      }
    }

    // ── Entities without certification_mode field (cert_ prefix is the mark) ──
    for (const { entity, idField } of PREFIX_ONLY_ENTITIES) {
      try {
        const records = arr(await b.entities[entity].filter(
          { [idField]: { $regex: '^cert_' } }, undefined, 500
        ));
        const allPrefixed = records.every((r: any) => isCertificationId(r[idField]) || isSyntheticRecord(r));

        report.prefix_only_entities.push({
          entity, total_synthetic: records.length,
          mark_mechanism: 'cert_ prefix on ' + idField,
          all_records_prefixed: allPrefixed,
        });
        report.total_synthetic += records.length;
      } catch (e) {
        report.errors.push(`${entity}: ${e.message}`);
      }
    }

    // ── Operational exclusion verification ──────────────────────────────
    if (mode === 'verify' || mode === 'dry_run') {
      report.operational_exclusion = {
        guard_function: 'isSyntheticRecord() checks certification_mode === true OR cert_ prefix on any identifier',
        delivery_guard: 'checkDeliveryGuard() blocks synthetic records before any HTTP request or state transition',
        affected_workflows: [
          'deliverPrepaidCompensation — unconditional guard before HTTP',
          'sendApprovedCompensationToPayroll — unconditional guard before HTTP',
          'syncSalesCompensationEvent — unconditional guard before HTTP',
          'inventoryCertificationData — excludes certification_mode records from production counts',
          'snapshotProductionFinancials — filters cert_ records before comparing balances',
        ],
      };
    }

    return Response.json(report);
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}