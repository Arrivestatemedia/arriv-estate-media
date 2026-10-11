import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  AUTOFUND_ENROLLMENT_FLAG_KEY,
  AUTOFUND_FINAL_FLAGS,
} from '../../shared/autoFundFinalConfig.ts';
import {
  AUTOFUND_INTERLOCK_VERSION,
  evaluateLaunchInterlock,
  readLaunchConfiguration,
  REQUIRED_PROCESSOR_CONTRACT_VERSION,
} from '../../shared/autoFundLaunchInterlock.ts';
import {
  AUTOFUND_TERMS_VERSION,
  AUTOFUND_TERMS_LEGAL_APPROVAL_KEY,
  AUTOFUND_FEE_REFUND_POLICY_KEY,
  AUTOFUND_WALLET_TERMS_APPROVAL_KEY,
} from '../../shared/autoFundComplianceDisclosure.ts';
import {
  AUTOFUND_SELF_SERVICE_FLAG_KEY,
  AUTOFUND_COHORT_REQUIRED_FLAG_KEY,
} from '../../shared/enrollmentCohort.ts';

// ============================================================================
// ARRIV AUTO-FUND — CONTROLLED, REVERSIBLE LAUNCH PROCEDURE
// ============================================================================
// Admin-only. This is the ONLY surface that writes the owner's enrollment switch.
//
// The procedure is deliberately two-sided:
//
//   PREFLIGHT  reads the real configuration and reports, requirement by
//              requirement, whether the system may safely be launched. It changes
//              nothing.
//
//   ENABLE     re-runs the same evaluation and REFUSES unless every prerequisite
//              is met. It cannot be talked into launching: there is no force flag,
//              no override and no partial launch.
//
//   DISABLE    turns the switch back off. The procedure is reversible, and
//              disabling never touches a subscription, a wallet, a balance or a
//              payment record.
//
// Legal approval and the refund policy are RECORDED here, by the owner, with the
// basis for the decision. They are never inferred, never defaulted and never
// assumed by code. `record_legal_decision` refuses a policy of 'undetermined'
// because that value means no decision has been made.
// ============================================================================

const ALLOWED_REFUND_POLICIES = ['non_refundable', 'refundable_full', 'refundable_prorated'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'status';
    const svc = base44.asServiceRole;

    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const readSetting = async (key) => {
      const res = await svc.entities.AppSetting.filter({ key }, undefined, 1);
      const rows = Array.isArray(res) ? res : (res?.data || []);
      return rows.length ? rows[0] : null;
    };

    const writeSetting = async (key, value, basis) => {
      const existing = await readSetting(key);
      const nowIso = new Date().toISOString();
      if (existing) {
        await svc.entities.AppSetting.update(existing.id, { value });
      } else {
        await svc.entities.AppSetting.create({ key, value });
      }
      if (basis) {
        const basisKey = `${key}_basis`;
        const basisValue = JSON.stringify({ ...basis, recorded_at: nowIso, recorded_by: user.email });
        const existingBasis = await readSetting(basisKey);
        if (existingBasis) {
          await svc.entities.AppSetting.update(existingBasis.id, { value: basisValue });
        } else {
          await svc.entities.AppSetting.create({ key: basisKey, value: basisValue });
        }
      }
      return { key, value, recorded_at: nowIso };
    };

    // ── Status ────────────────────────────────────────────────────────────────
    if (action === 'status' || action === 'preflight') {
      const config = await readLaunchConfiguration(svc);
      const evaluation = evaluateLaunchInterlock(config);
      const channelState = {
        self_service: (await readSetting(AUTOFUND_SELF_SERVICE_FLAG_KEY))?.value ?? null,
        cohort_required: (await readSetting(AUTOFUND_COHORT_REQUIRED_FLAG_KEY))?.value ?? null,
      };

      // Prerequisites the OWNER must supply, as distinct from engineering items.
      const ownerPrerequisites = [
        {
          id: 'LEGAL_TERMS_APPROVED',
          satisfied: config.terms_legally_approved,
          action: 'record_legal_decision',
          decision: 'terms_approval',
          needs: `Counsel approval of terms version ${AUTOFUND_TERMS_VERSION}.`,
        },
        {
          id: 'FEE_REFUND_POLICY_APPROVED',
          satisfied: config.fee_refund_policy !== 'undetermined',
          action: 'record_legal_decision',
          decision: 'fee_refund_policy',
          needs: 'A membership-fee refund policy chosen after legal review. The system will not choose one.',
        },
        {
          id: 'WALLET_TERMS_APPROVED',
          satisfied: config.wallet_terms_approved,
          action: 'record_legal_decision',
          decision: 'wallet_terms_approval',
          needs: 'Counsel approval of the separate wallet refund, expiry and unclaimed-property terms.',
        },
      ];

      const response = {
        interlock_version: AUTOFUND_INTERLOCK_VERSION,
        enrollment_switch: {
          key: AUTOFUND_ENROLLMENT_FLAG_KEY,
          present: config.enrollment_switch_value !== null,
          value: config.enrollment_switch_value,
          code_flag: AUTOFUND_FINAL_FLAGS.enrollment_enabled,
          note: 'Enrollment opens only when the code flag AND this switch are both true.',
        },
        // The two channel controls the owner sets independently of the master gate.
        enrollment_channels: {
          self_service: {
            key: AUTOFUND_SELF_SERVICE_FLAG_KEY,
            value: channelState.self_service,
            open: channelState.self_service === 'true',
          },
          cohort_required: {
            key: AUTOFUND_COHORT_REQUIRED_FLAG_KEY,
            value: channelState.cohort_required,
            in_force: channelState.cohort_required === 'true',
            note: 'While in force, only allowlisted customers may enroll. The owner removed this requirement on 2026-10-11.',
          },
        },
        configuration: {
          membership_fee_enabled: config.membership_fee_enabled,
          vip_mls_promo_restriction_enabled: config.vip_mls_promo_restriction_enabled,
          terms_version: config.terms_version,
          terms_legally_approved: config.terms_legally_approved,
          fee_refund_policy: config.fee_refund_policy,
          wallet_terms_approved: config.wallet_terms_approved,
          mls_v2_configured: config.mls_v2_configured,
          processor_contract_version: config.processor_contract_version,
          processor_contract_required: REQUIRED_PROCESSOR_CONTRACT_VERSION,
        },
        permitted: evaluation.permitted,
        blocker_count: evaluation.blockers.length,
        blockers: evaluation.blockers,
        owner_prerequisites: ownerPrerequisites,
        // Engineering prerequisites, reported separately so an owner can see what is
        // theirs to decide and what is an engineering action.
        engineering_notes: evaluation.permitted
          ? []
          : ['The membership-fee switch and the VIP restriction are code flags; launching requires them to be deployed enabled.'],
      };

      if (action === 'status') {
        return Response.json({ status: 'success', ...response });
      }

      return Response.json({
        status: 'success',
        ...response,
        checks: evaluation.checks,
        tiers: evaluation.tiers,
        verdict: evaluation.permitted
          ? 'The configuration is complete. Enrollment may be enabled.'
          : `LAUNCH REFUSED: ${evaluation.blockers.length} unmet requirement(s). Enrollment stays closed.`,
      });
    }

    // ── Record a legal decision ───────────────────────────────────────────────
    // The owner's declaration, with its basis. Never inferred, never defaulted.
    if (action === 'record_legal_decision') {
      const { decision, value, counsel_reference } = body;

      if (!decision) return Response.json({ error: 'decision is required' }, { status: 400 });
      if (!counsel_reference || !String(counsel_reference).trim()) {
        return Response.json(
          { error: 'A counsel_reference is required. An approval with no recorded basis is not an approval.' },
          { status: 400 },
        );
      }

      if (decision === 'terms_approval') {
        if (value !== AUTOFUND_TERMS_VERSION) {
          return Response.json(
            { error: `value must be the terms version being approved (${AUTOFUND_TERMS_VERSION}).` },
            { status: 400 },
          );
        }
        const recorded = await writeSetting(AUTOFUND_TERMS_LEGAL_APPROVAL_KEY, value, { decision, value, counsel_reference });
        return Response.json({ status: 'success', recorded, message: `Terms version ${value} approved. This is a launch prerequisite, not an activation.` });
      }

      if (decision === 'fee_refund_policy') {
        if (!ALLOWED_REFUND_POLICIES.includes(value)) {
          return Response.json(
            { error: `value must be one of: ${ALLOWED_REFUND_POLICIES.join(', ')}. 'undetermined' means no decision has been made.` },
            { status: 400 },
          );
        }
        const recorded = await writeSetting(AUTOFUND_FEE_REFUND_POLICY_KEY, value, { decision, value, counsel_reference });
        return Response.json({ status: 'success', recorded, message: `Membership-fee refund policy recorded as ${value}.` });
      }

      if (decision === 'wallet_terms_approval') {
        const normalised = value === true || value === 'true' ? 'true' : 'false';
        const recorded = await writeSetting(AUTOFUND_WALLET_TERMS_APPROVAL_KEY, normalised, { decision, value: normalised, counsel_reference });
        return Response.json({ status: 'success', recorded, message: `Wallet terms approval recorded as ${normalised}.` });
      }

      return Response.json(
        { error: 'Unknown decision. Use terms_approval, fee_refund_policy or wallet_terms_approval.' },
        { status: 400 },
      );
    }

    // ── Enrollment channel switches (owner-controlled, reversible) ────────────
    // Independent of the master gate: the public self-service channel, and whether a
    // named cohort is still required. Neither one can charge a customer, and neither
    // one lets a customer be enrolled without their own authorization.
    if (action === 'set_self_service' || action === 'set_cohort_requirement') {
      const isSelfService = action === 'set_self_service';
      const key = isSelfService ? AUTOFUND_SELF_SERVICE_FLAG_KEY : AUTOFUND_COHORT_REQUIRED_FLAG_KEY;
      const enable = body.enabled === true || body.enabled === 'true';
      const recorded = await writeSetting(key, enable ? 'true' : 'false', {
        decision: action,
        value: enable ? 'true' : 'false',
        counsel_reference: body.authorization_reference || 'owner authorization 2026-10-11',
      });
      return Response.json({
        status: 'success',
        switch: key,
        value: enable ? 'true' : 'false',
        recorded,
        message: isSelfService
          ? `Public self-service enrollment is now ${enable ? 'OPEN' : 'closed'}. Sales-assisted enrollment is unaffected.`
          : `A named cohort is now ${enable ? 'REQUIRED — only allowlisted customers may enroll' : 'not required — any eligible customer may enroll'}.`,
      });
    }

    // ── Enable enrollment ────────────────────────────────────────────────────
    // Re-evaluated against the REAL configuration. There is no override.
    if (action === 'enable_enrollment') {
      const config = await readLaunchConfiguration(svc);
      const evaluation = evaluateLaunchInterlock(config);

      if (!evaluation.permitted) {
        return Response.json(
          {
            status: 'refused',
            permitted: false,
            error: `Enrollment was NOT enabled: ${evaluation.blockers.length} launch prerequisite(s) are unmet.`,
            blockers: evaluation.blockers,
          },
          { status: 409 },
        );
      }

      const recorded = await writeSetting(AUTOFUND_ENROLLMENT_FLAG_KEY, 'true', {
        decision: 'enable_enrollment',
        value: 'true',
        counsel_reference: 'prerequisites verified',
      });

      return Response.json({
        status: 'success',
        enrollment_enabled: true,
        recorded,
        message: 'Enrollment is now enabled. It can be disabled again at any time with disable_enrollment.',
      });
    }

    // ── Disable enrollment (reversible) ──────────────────────────────────────
    if (action === 'disable_enrollment') {
      const recorded = await writeSetting(AUTOFUND_ENROLLMENT_FLAG_KEY, 'false', {
        decision: 'disable_enrollment',
        value: 'false',
        counsel_reference: 'owner action',
      });
      return Response.json({
        status: 'success',
        enrollment_enabled: false,
        recorded,
        message:
          'Enrollment is closed. No subscription, wallet, balance or payment record was changed — disabling only stops new enrollment.',
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}