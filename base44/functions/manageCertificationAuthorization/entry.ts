import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  CERTIFICATION_DOMAINS,
  computeAuthorizationReadiness,
  computeDomainStatuses,
  checkCertificationEligibility,
  KNOWLEDGE_BANK_VERSION,
} from '../../shared/salesTrainingShared.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json();
    const { action, sales_member_id, ...payload } = body;

    // Find the certification record
    const certs = await base44.asServiceRole.entities.SalesCertification.filter(
      { sales_member_id },
      '-updated_date',
      1
    );
    let cert = certs?.[0];

    if (!cert) {
      // For get_status, just return null if no cert exists
      if (action === 'get_status') {
        return Response.json({
          certification: null,
          readiness: null,
          domains: null,
          eligibility: null,
          simulation_events: [],
          critical_misses: [],
          warnings: [],
          knowledge_bank_version: KNOWLEDGE_BANK_VERSION,
        });
      }

      // Auto-create for other actions
      const teamMembers = await base44.asServiceRole.entities.SalesTeamMember.filter(
        { id: sales_member_id },
        '-updated_date',
        1
      );
      const member = teamMembers?.[0];
      if (!member) return Response.json({ error: 'Sales team member not found' }, { status: 404 });

      cert = await base44.asServiceRole.entities.SalesCertification.create({
        sales_member_id,
        sales_member_email: member.email,
        sales_member_name: member.full_name,
        training_status: 'NOT_STARTED',
        calling_authorization: 'CALLING_LOCKED',
        modules_completed: [],
        modules_passed_count: 0,
        modules_total: 20,
        quiz_average_score: 0,
        critical_questions_status: 'PENDING',
        knowledge_bank_version: KNOWLEDGE_BANK_VERSION,
        certification_domains: {
          product_knowledge: 'PENDING',
          system_operation: 'PENDING',
          sales_execution: 'PENDING',
          customer_onboarding: 'PENDING',
          customer_training: 'PENDING',
        },
        critical_failures: [],
        remediation_modules: [],
        manager_coaching_notes: [],
        manager_interventions: [],
      });
    }

    const now = new Date().toISOString();
    const managerEmail = user.email;
    const managerName = user.full_name || user.email;
    const interventions = cert.manager_interventions || [];
    const coachingNotes = cert.manager_coaching_notes || [];

    switch (action) {
      case 'authorize_certification': {
        // Check readiness — automated scores do NOT authorize, only the manager does
        const readiness = computeAuthorizationReadiness(cert);
        if (!readiness.ready_for_authorization) {
          return Response.json({
            error: 'Learner does not meet all certification requirements',
            readiness,
            missing: checkCertificationEligibility(cert).missing,
          }, { status: 400 });
        }

        const domainStatuses = computeDomainStatuses(cert);
        const certifiedDomains = CERTIFICATION_DOMAINS
          .filter(d => domainStatuses[d.key] === 'PASSED')
          .map(d => d.label);

        interventions.push({
          intervention_id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'authorization_grant',
          reason: payload.reason || 'Manager authorized certification after all requirements met',
          manager_email: managerEmail,
          manager_name: managerName,
          created_at: now,
          effective_at: now,
          metadata: { readiness, domains: certifiedDomains },
        });

        const updated = await base44.asServiceRole.entities.SalesCertification.update(cert.id, {
          training_status: 'SALES_CERTIFIED',
          calling_authorization: 'INDEPENDENT_CALLING_AUTHORIZED',
          certified_at: now,
          certified_by: managerEmail,
          certified_domains: certifiedDomains,
          certification_domains: domainStatuses,
          authorization_readiness: readiness,
          manager_interventions: interventions,
        });

        return Response.json({ success: true, certification: updated, certified_domains: certifiedDomains });
      }

      case 'hold_authorization': {
        // Manager explicitly holds authorization even if automated scores pass
        interventions.push({
          intervention_id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'authorization_hold',
          reason: payload.reason || 'Manager placed authorization hold',
          manager_email: managerEmail,
          manager_name: managerName,
          created_at: now,
          effective_at: now,
          metadata: payload.metadata || {},
        });

        const updated = await base44.asServiceRole.entities.SalesCertification.update(cert.id, {
          training_status: 'AWAITING_CERTIFICATION',
          manager_interventions: interventions,
        });
        return Response.json({ success: true, certification: updated });
      }

      case 'add_coaching_note': {
        const note = {
          note_id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          note: payload.note,
          domain: payload.domain || 'general',
          created_by: managerName,
          created_by_email: managerEmail,
          created_at: now,
          acknowledged: false,
        };
        coachingNotes.push(note);

        interventions.push({
          intervention_id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'coaching',
          reason: `Coaching note added: ${payload.note?.slice(0, 100) || ''}`,
          manager_email: managerEmail,
          manager_name: managerName,
          created_at: now,
          effective_at: now,
          metadata: { note_id: note.note_id, domain: note.domain },
        });

        const updated = await base44.asServiceRole.entities.SalesCertification.update(cert.id, {
          manager_coaching_notes: coachingNotes,
          manager_interventions: interventions,
        });
        return Response.json({ success: true, certification: updated, note });
      }

      case 'assign_remediation': {
        const remediationModules = payload.module_ids || [];
        const existing = cert.remediation_modules || [];
        const merged = Array.from(new Set([...existing, ...remediationModules]));

        interventions.push({
          intervention_id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'remediation_assignment',
          reason: payload.reason || `Remediation assigned for modules: ${remediationModules.join(', ')}`,
          manager_email: managerEmail,
          manager_name: managerName,
          created_at: now,
          effective_at: now,
          metadata: { module_ids: remediationModules },
        });

        const updated = await base44.asServiceRole.entities.SalesCertification.update(cert.id, {
          remediation_modules: merged,
          training_status: 'REMEDIATION_REQUIRED',
          manager_interventions: interventions,
        });
        return Response.json({ success: true, certification: updated });
      }

      case 'clear_remediation': {
        const moduleToClear = payload.module_id;
        const remaining = (cert.remediation_modules || []).filter(m => m !== moduleToClear);

        interventions.push({
          intervention_id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'remediation_assignment',
          reason: `Remediation cleared for module: ${moduleToClear}`,
          manager_email: managerEmail,
          manager_name: managerName,
          created_at: now,
          effective_at: now,
          metadata: { module_id: moduleToClear, cleared: true },
        });

        const newStatus = remaining.length === 0 ? 'AWAITING_CERTIFICATION' : 'REMEDIATION_REQUIRED';
        const updated = await base44.asServiceRole.entities.SalesCertification.update(cert.id, {
          remediation_modules: remaining,
          training_status: newStatus,
          manager_interventions: interventions,
        });
        return Response.json({ success: true, certification: updated });
      }

      case 'lock_calling': {
        interventions.push({
          intervention_id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'calling_lock',
          reason: payload.reason || 'Manager locked calling privileges',
          manager_email: managerEmail,
          manager_name: managerName,
          created_at: now,
          effective_at: now,
          metadata: {},
        });

        const updated = await base44.asServiceRole.entities.SalesCertification.update(cert.id, {
          calling_authorization: 'CALLING_LOCKED',
          manager_interventions: interventions,
        });
        return Response.json({ success: true, certification: updated });
      }

      case 'unlock_supervised_calling': {
        interventions.push({
          intervention_id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'calling_unlock',
          reason: payload.reason || 'Manager unlocked supervised calling',
          manager_email: managerEmail,
          manager_name: managerName,
          created_at: now,
          effective_at: now,
          metadata: { level: 'SUPERVISED_CALLING_ONLY' },
        });

        const updated = await base44.asServiceRole.entities.SalesCertification.update(cert.id, {
          calling_authorization: 'SUPERVISED_CALLING_ONLY',
          manager_interventions: interventions,
        });
        return Response.json({ success: true, certification: updated });
      }

      case 'suspend_certification': {
        interventions.push({
          intervention_id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'suspension',
          reason: payload.reason || 'Certification suspended by manager',
          manager_email: managerEmail,
          manager_name: managerName,
          created_at: now,
          effective_at: now,
          metadata: {},
        });

        const updated = await base44.asServiceRole.entities.SalesCertification.update(cert.id, {
          training_status: 'CERTIFICATION_SUSPENDED',
          calling_authorization: 'CALLING_LOCKED',
          suspended_at: now,
          suspended_reason: payload.reason,
          manager_interventions: interventions,
        });
        return Response.json({ success: true, certification: updated });
      }

      case 'restore_certification': {
        interventions.push({
          intervention_id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'restoration',
          reason: payload.reason || 'Certification restored by manager',
          manager_email: managerEmail,
          manager_name: managerName,
          created_at: now,
          effective_at: now,
          metadata: {},
        });

        const updated = await base44.asServiceRole.entities.SalesCertification.update(cert.id, {
          training_status: 'SALES_CERTIFIED',
          calling_authorization: 'INDEPENDENT_CALLING_AUTHORIZED',
          restored_at: now,
          manager_interventions: interventions,
        });
        return Response.json({ success: true, certification: updated });
      }

      case 'record_practical_score': {
        // Manager records a practical score (roleplay, system_crm, onboarding, teachback)
        const practicalType = payload.practical_type; // 'roleplay' | 'system_crm' | 'onboarding' | 'teachback'
        const score = payload.score;
        const passed = score >= 95 && !(payload.critical_failures?.length > 0);

        const updateFields: Record<string, any> = {};
        updateFields[`${practicalType}_score`] = score;
        updateFields[`${practicalType}_passed`] = passed;
        updateFields[`${practicalType}_completed_at`] = now;
        updateFields[`${practicalType}_evaluator`] = managerEmail;

        if (payload.critical_failures?.length > 0) {
          const existingFailures = cert.critical_failures || [];
          updateFields.critical_failures = Array.from(new Set([...existingFailures, ...payload.critical_failures]));
        }

        // Recompute readiness and domain statuses
        const tempCert = { ...cert, ...updateFields };
        updateFields.authorization_readiness = computeAuthorizationReadiness(tempCert);
        updateFields.certification_domains = computeDomainStatuses(tempCert);

        interventions.push({
          intervention_id: `iv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'score_override',
          reason: `Manager recorded ${practicalType} score: ${score}/100 (${passed ? 'PASSED' : 'FAILED'})`,
          manager_email: managerEmail,
          manager_name: managerName,
          created_at: now,
          effective_at: now,
          metadata: { practical_type: practicalType, score, passed, critical_failures: payload.critical_failures || [] },
        });
        updateFields.manager_interventions = interventions;

        const updated = await base44.asServiceRole.entities.SalesCertification.update(cert.id, updateFields);
        return Response.json({ success: true, certification: updated });
      }

      case 'get_status': {
        const readiness = computeAuthorizationReadiness(cert);
        const domains = computeDomainStatuses(cert);
        const eligibility = checkCertificationEligibility(cert);

        // Get simulation events for this learner
        const events = await base44.asServiceRole.entities.TrainingSimulationEvent.filter(
          { learner_id: sales_member_id },
          '-timestamp',
          200
        );

        const criticalMisses = (events || []).filter(e => e.validation_result === 'critical_failure');
        const warnings = (events || []).filter(e => e.validation_result === 'warning');

        return Response.json({
          certification: cert,
          readiness,
          domains,
          eligibility,
          simulation_events: events || [],
          critical_misses: criticalMisses,
          warnings,
          knowledge_bank_version: KNOWLEDGE_BANK_VERSION,
        });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}