import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  MLS_PRICING_VERSION_LIVE,
  MLS_PRICING_VERSION_V1,
  MLS_PRICING_VERSION_V2,
  MLS_PRICE_V1_BY_TIER,
  MLS_PRICE_V2_BY_TIER,
  MLS_PRICE_STANDARD_APPROVED,
  MLS_PRICE_STANDARD_LIVE,
  MLS_SQFT_BANDS,
  mlsLadderFor,
  mlsStandardPrice,
} from '../../shared/mlsPricing.ts';
import { MLS_RETAIL, MLS_RETAIL_LIVE } from '../../shared/autoFundMlsAllowance.ts';
import { AUTOFUND_SELF_SERVICE_FLAG_KEY } from '../../shared/enrollmentCohort.ts';
import { AUTOFUND_EMERGENCY_STOP_KEY } from '../../shared/autoFundEmergencyStop.ts';
import { AUTOFUND_ENROLLMENT_FLAG_KEY, AUTOFUND_FINAL_FLAGS } from '../../shared/autoFundFinalConfig.ts';

/**
 * ADMIN-ONLY, READ-ONLY — PREPARED $120 (V2) MLS PRICING ACTIVATION.
 *
 * Prepares and TESTS the coordinated V2 activation WITHOUT activating it and
 * WITHOUT charging any customer. It writes nothing.
 *
 * The change has two halves that must land together:
 *   DATA  — the active MediaPricingConfig record (what every booking path reads)
 *   CODE  — MLS_PRICING_VERSION_LIVE (what the constant-reading surfaces follow)
 *
 * This endpoint proves the prepared end state is coherent, proves non-MLS prices
 * are untouched, and reports the exact sequence plus the monitoring plan.
 */

const SURFACES = [
  { surface: 'retail checkout pricing', source: 'active MediaPricingConfig record (mediaConfigLoader → mediaPricingEngine)', family: 'record' },
  { surface: 'scheduled bookings', source: 'active MediaPricingConfig record', family: 'record' },
  { surface: 'booking pricing snapshots', source: 'active MediaPricingConfig record', family: 'record' },
  { surface: 'invoices (pay-up-front, deposit, final closing)', source: 'active MediaPricingConfig record', family: 'record' },
  { surface: 'B2B media-credit costing', source: 'active MediaPricingConfig record (b2bCreditCostResolver)', family: 'record' },
  { surface: 'B2B entitlements', source: 'active MediaPricingConfig record (b2bEntitlementEngine)', family: 'record' },
  { surface: 'Auto-Fund MLS allowance and redemption math', source: 'shared mlsPricing ladder (Auto-Fund valued at the approved V2 standard)', family: 'constant' },
  { surface: 'Auto-Fund allowance design tool', source: 'shared mlsPricing live ladder', family: 'constant' },
  { surface: 'Auto-Fund financial verification and certifications', source: 'shared mlsPricing ladders', family: 'constant' },
];

const MONITORING = [
  { area: 'Billing', watch: 'wallet-funding vs membership-fee charges, amounts against each contract, failed attempts and retries' },
  { area: 'Refunds', watch: 'fee refunds and their reasons; wallet refund requests' },
  { area: 'Disputes', watch: 'chargebacks opened, value held, evidence completeness, release or reversal' },
  { area: 'Wallet liabilities', watch: 'issued vs redeemed vs expired Booking Value, outstanding cash-funded and promotional balances, held value' },
  { area: 'Service fulfillment', watch: 'bookings created against redeemed value, delivery completion, MLS allowance usage' },
  { area: 'Commission delivery', watch: 'funding commissions raised, reversals on refunds and disputes, payroll delivery status' },
  { area: 'Price integrity', watch: 'every charged amount resolved from the active V2 record, with no V1 fallback' },
];

const ACTIVATION_SEQUENCE = [
  // ── Prerequisite: the OWNER records the legal decisions before any switch ────
  'STEP 0 (OWNER, prerequisite — NOT an activation): record the legal decisions through manageAutoFundLaunch, action record_legal_decision, each with its counsel_reference — one for terms approval (value must be the current AUTOFUND_TERMS_VERSION, now autofund_membership_v2) and one for wallet_terms_approval. Confirm the clearance covers the FINAL fee schedule ($5.99 / $10 / $25 / $27 / $30, totalling $155.99 / $260 / $375 / $527 / $1,030), which differs from the schedule in the drafts first reviewed. Recording a prerequisite charges nobody and opens nothing.',
  // ── Pricing ─────────────────────────────────────────────────────────────────
  "STEP 1 (CODE, same release): set MLS_PRICING_VERSION_LIVE = 'V2' in base44/shared/mlsPricing.ts. This is the only version switch; MLS_PRICE_STANDARD_LIVE and every derived figure follow it automatically.",
  'STEP 2 (DATA, immediately after): set the V2 MediaPricingConfig record is_active = true and the V1 record is_active = false.',
  'STEP 3 (VERIFY): re-run this endpoint. code_matches_active_record must be true, v1_fallback_inconsistency_present false, and both halves must name V2 / $120.',
  'STEP 4 (VERIFY, one live booking): create one internal test booking and confirm the quoted, snapshotted and invoiced MLS price is the V2 price and any non-MLS package and add-on price is unchanged.',
  'STEP 5 (RE-VERIFY, financial): re-run the Auto-Fund financial verification at the now-live $120 before enabling enrollment.',
  // ── Membership-fee billing ──────────────────────────────────────────────────
  'STEP 6 (CODE, same release as STEP 1): set AUTOFUND_FINAL_FLAGS.membership_fee_enabled = true and vip_mls_promo_restriction_enabled = true in base44/shared/autoFundFinalConfig.ts. The interlock refuses launch on any fee-bearing tier while fee billing is off, so the fee schedule and this switch ship together.',
  // ── Enrollment cohort ───────────────────────────────────────────────────────
  'STEP 7 (DATA): create the AutoFundCohortMember entries for the approved sales-assisted customers with allowed_channels = ["sales_assisted"]. Leave the public self-service switch (autofund_self_service_enabled) OFF — a cohort entry never grants public enrollment, which is gated separately.',
  // ── Enrollment gate: last, and it self-checks ───────────────────────────────
  'STEP 8 (CODE + DATA, last): set enrollment_enabled = true in base44/shared/autoFundFinalConfig.ts, then invoke manageAutoFundLaunch with action enable_enrollment. That call re-reads the real configuration and refuses if any prerequisite is unmet, so it is the final self-check rather than a formality.',
  'STEP 9 (VERIFY, after every switch): re-run manageAutoFundLaunch preflight and confirm permitted = true with zero blockers, then re-run this endpoint and the Auto-Fund financial verification at the live $120 and the live fee schedule.',
  // ── Rollback ────────────────────────────────────────────────────────────────
  'ROLLBACK: set the master gate back to false (manageAutoFundLaunch disable_enrollment) and revert the code flags. The emergency stop (autofund_emergency_stop) halts new enrollment, new fee billing and new funding issuance while leaving cancellation, pause/resume, redemption, refunds, disputes and support working — so existing customers keep service through any rollback.',
];

/** Numeric/string leaves of a config object, by path, so two records can be compared. */
function leaves(obj: any, prefix = ''): Record<string, any> {
  const out: Record<string, any> = {};
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => Object.assign(out, leaves(v, `${prefix}[${i}]`)));
    return out;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) Object.assign(out, leaves(obj[k], prefix ? `${prefix}.${k}` : k));
    return out;
  }
  out[prefix] = obj;
  return out;
}

const isMlsPricePath = (p: string) => /mls/i.test(p);

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const sr = base44.asServiceRole;
    const checks: { item: string; ok: boolean; detail: string }[] = [];
    const check = (item: string, ok: boolean, detail: string) => checks.push({ item, ok: !!ok, detail });

    const parse = (rec: any): any => {
      try {
        return typeof rec?.config_json === 'string' ? JSON.parse(rec.config_json) : (rec?.config_json ?? null);
      } catch {
        return null;
      }
    };
    const mlsFromJson = (rec: any): Record<string, number> => {
      const json = parse(rec);
      const out: Record<string, number> = {};
      for (const t of json?.tier_prices || []) {
        const v = t?.prices?.mls_walkthrough;
        if (typeof v === 'number') out[t.tier] = v;
      }
      return out;
    };

    // ── 1. Pricing records ───────────────────────────────────────────────────
    const records = await sr.entities.MediaPricingConfig.list('-effective_date', 20);
    const active = records.find((r: any) => r.is_active === true) || null;
    const v1Record = records.find((r: any) => String(r.pricing_version || '') === MLS_PRICING_VERSION_V1) || null;
    const v2Record = records.find((r: any) => String(r.pricing_version || '') === MLS_PRICING_VERSION_V2) || null;

    check('1 · The approved V2 pricing record exists', !!v2Record, v2Record ? `id ${v2Record.id}, effective ${v2Record.effective_date}` : 'NOT FOUND');
    check('2 · The approved V2 record is present but NOT active (nothing activated)', !!v2Record && v2Record.is_active === false, `is_active=${v2Record?.is_active}`);
    check('3 · The V1 record is the active record today', !!active && String(active.pricing_version) === MLS_PRICING_VERSION_V1, `active=${active?.pricing_version} at $${mlsFromJson(active).TIER_1}`);

    const v2Ladder = v2Record ? mlsFromJson(v2Record) : {};
    const ladderMatches = Object.keys(MLS_PRICE_V2_BY_TIER).every((k) => v2Ladder[k] === MLS_PRICE_V2_BY_TIER[k]);
    check('4 · The V2 record carries the owner-approved ladder exactly', ladderMatches,
      `record=${JSON.stringify(v2Ladder)} approved=${JSON.stringify(MLS_PRICE_V2_BY_TIER)}`);

    // ── 2. The two previously outdated price assertions are now version-derived ─
    const derivedLive = mlsStandardPrice(MLS_PRICING_VERSION_LIVE);
    check('5 · Live standard price is derived from the live version, not pinned to V1',
      MLS_PRICE_STANDARD_LIVE === derivedLive,
      `MLS_PRICE_STANDARD_LIVE=$${MLS_PRICE_STANDARD_LIVE}, mlsStandardPrice(${MLS_PRICING_VERSION_LIVE})=$${derivedLive}`);
    check('6 · Approved standard price is the V2 standard', MLS_PRICE_STANDARD_APPROVED === MLS_PRICE_V2_BY_TIER.TIER_1,
      `approved=$${MLS_PRICE_STANDARD_APPROVED}`);
    check('7 · Flipping the version constant alone yields the approved price (dry run)',
      mlsStandardPrice('V2') === 120 && mlsStandardPrice('V1') === 100 && mlsStandardPrice('V2') === MLS_PRICE_STANDARD_APPROVED,
      `V1=$${mlsStandardPrice('V1')} · V2=$${mlsStandardPrice('V2')}`);

    // ── 3. Non-MLS prices are identical between the two records ──────────────
    const v1Leaves = leaves(parse(v1Record));
    const v2Leaves = leaves(parse(v2Record));
    const allPaths = Array.from(new Set([...Object.keys(v1Leaves), ...Object.keys(v2Leaves)]));
    // Only PRICE-bearing paths are compared. Version labels, effective dates and
    // record metadata are EXPECTED to differ between two pricing versions, so
    // counting them would mask a real price difference rather than find one.
    const pricePath = (p: string) => /prices?\./i.test(p);
    const nonMlsPaths = allPaths.filter((p) => pricePath(p) && !isMlsPricePath(p));
    const nonMlsDiffs = nonMlsPaths.filter((p) => v1Leaves[p] !== v2Leaves[p]);
    const metadataDifferenceCount = allPaths.filter((p) => !pricePath(p) && v1Leaves[p] !== v2Leaves[p]).length;
    check('8 · Every non-MLS package and add-on price is unchanged between V1 and V2',
      nonMlsDiffs.length === 0 && nonMlsPaths.length > 0,
      nonMlsDiffs.length === 0
        ? `${nonMlsPaths.length} non-MLS price entries compared: identical (plus ${metadataDifferenceCount} expected metadata differences: version label and dates)`
        : `${nonMlsDiffs.length} price difference(s), first: ${nonMlsDiffs[0]} V1=${v1Leaves[nonMlsDiffs[0]]} V2=${v2Leaves[nonMlsDiffs[0]]}`);

    const changedPaths = Array.from(new Set([...Object.keys(v1Leaves), ...Object.keys(v2Leaves)]))
      .filter((p) => isMlsPricePath(p) && v1Leaves[p] !== v2Leaves[p]);

    // ── 4. Dry run: the ladder moves coherently across every square-footage band ─
    const dryRun = MLS_SQFT_BANDS.map((b) => ({
      band: b.label,
      tier: b.tier,
      today_v1: mlsLadderFor('V1')[b.tier],
      prepared_v2: mlsLadderFor('V2')[b.tier],
      increase: mlsLadderFor('V2')[b.tier] - mlsLadderFor('V1')[b.tier],
    }));
    const incrementsPreserved = MLS_SQFT_BANDS.map((b) => mlsLadderFor('V2')[b.tier] - mlsLadderFor('V1')[b.tier]);
    check('9 · All five square-footage bands move to V2 together, with the increments preserved',
      incrementsPreserved.every((d) => d === 20),
      `per-band increase: ${incrementsPreserved.join(' / ')}`);

    // ── 5. Both pricing families already agree, and both follow the same switch ─
    const recordMlsStandard = mlsFromJson(active).TIER_1;
    check('10 · The record-reading surfaces and the constant-reading surfaces agree today',
      recordMlsStandard === MLS_PRICE_STANDARD_LIVE,
      `active record $${recordMlsStandard} · constants $${MLS_PRICE_STANDARD_LIVE}`);
    check('11 · Auto-Fund allowance math is valued at the approved V2 standard while retail is live V1',
      MLS_RETAIL === MLS_PRICE_STANDARD_APPROVED && MLS_RETAIL_LIVE === MLS_PRICE_STANDARD_LIVE,
      `allowance retail $${MLS_RETAIL} (approved) · live retail $${MLS_RETAIL_LIVE}`);
    check('12 · No constant-reading surface is left pinned to V1 after the switch',
      MLS_PRICE_STANDARD_LIVE === derivedLive && MLS_RETAIL_LIVE === derivedLive,
      'both derived from the single live-version constant');

    // ── 6. Prepared launch control state (nothing activated) ──────────────────
    const readSetting = async (key: string) => {
      const res = await sr.entities.AppSetting.filter({ key }, undefined, 5);
      const rows = Array.isArray(res) ? res : (res?.data || []);
      return rows.length ? rows[0].value : null;
    };
    const controlState = {
      v2_record_active: v2Record?.is_active === true,
      code_live_version: MLS_PRICING_VERSION_LIVE,
      master_enrollment_gate: await readSetting(AUTOFUND_ENROLLMENT_FLAG_KEY),
      public_self_service: await readSetting(AUTOFUND_SELF_SERVICE_FLAG_KEY),
      emergency_stop: await readSetting(AUTOFUND_EMERGENCY_STOP_KEY),
      membership_fee_enabled: AUTOFUND_FINAL_FLAGS.membership_fee_enabled,
      vip_promo_restriction_enabled: AUTOFUND_FINAL_FLAGS.vip_mls_promo_restriction_enabled,
    };
    check('13 · Nothing is activated: V2 inactive, master gate, self-service, fee billing and the VIP restriction all off',
      controlState.v2_record_active === false
        && controlState.code_live_version === 'V1'
        && controlState.master_enrollment_gate !== 'true'
        && controlState.public_self_service !== 'true'
        && controlState.membership_fee_enabled === false
        && controlState.vip_promo_restriction_enabled === false,
      JSON.stringify(controlState));
    check('14 · Public self-service enrollment remains disabled', controlState.public_self_service !== 'true',
      `autofund_self_service=${controlState.public_self_service ?? 'absent'}`);

    const failed = checks.filter((c) => !c.ok);

    return Response.json({
      status: 'V2_ACTIVATION_PREPARED_NOT_ACTIVATED',
      prepared: failed.length === 0,
      read_only: true,
      wrote_anything: false,
      verification: {
        total: checks.length,
        passed: checks.length - failed.length,
        failed: failed.length,
        failures: failed.map((c) => `${c.item} :: ${c.detail}`),
      },
      checks,
      today: {
        live_version: MLS_PRICING_VERSION_LIVE,
        live_standard_price: MLS_PRICE_STANDARD_LIVE,
        prepared_version: 'V2',
        prepared_standard_price: MLS_PRICE_STANDARD_APPROVED,
        v2_record_id: v2Record?.id ?? null,
        v1_record_id: v1Record?.id ?? null,
      },
      dry_run_by_band: dryRun,
      changed_price_paths_only: changedPaths,
      non_mls_paths_compared: nonMlsPaths.length,
      surfaces: SURFACES,
      activation_sequence: ACTIVATION_SEQUENCE,
      monitoring_plan: MONITORING,
      legal_gate_note:
        'COORDINATED ACTIVATION PREPARED — NOTHING ACTIVATED. This endpoint verifies the V2 pricing half and reports the full coordinated sequence for pricing, membership-fee billing and sales-assisted enrollment. Every switch is still off: V2 is inactive, fee billing is off, the master enrollment gate is unset, public self-service is disabled and the emergency stop is inactive. Enrollment still requires the recorded legal clearance (terms and wallet terms, each with its counsel_reference) plus the owner activation gates; none of it is touched by this endpoint.',
      note: 'Read-only preparation. No price, record, flag, fee, tier or customer record was changed.',
    });
  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}