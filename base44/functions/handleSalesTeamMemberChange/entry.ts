import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { ensureEmployeeId, enqueueSync, runSyncAttempt } from "../../shared/payrollEmployeeSync.ts";
import { writeAuditLog } from "../../shared/payrollAudit.ts";
import { startOrientation } from "../../shared/salesOrientationEngine.ts";

// Entity automation handler: fires on every SalesTeamMember create/update.
// Maps changed fields to Arriv Payroll sync events and triggers the sync.
// This is the single source of truth for the 15 employee-sync triggers —
// it catches edits from admin pages, backend functions, and the SDK alike.

const FIELD_TO_EVENT = {
  legal_first_name: "legal_name_change",
  legal_middle_name: "legal_name_change",
  legal_last_name: "legal_name_change",
  preferred_name: "legal_name_change",
  home_address: "address_change",
  employee_city: "address_change",
  employee_state: "address_change",
  employee_zip: "address_change",
  employee_country: "address_change",
  mobile_phone_number: "phone_change",
  phone_number: "phone_change",
  personal_email: "personal_email_change",
  email: "personal_email_change",
  work_state: "work_state_change",
  primary_work_location: "work_state_change",
  title: "job_title_change",
  employment_status: "employment_status_change",
  employment_classification: "employment_status_change",
  commission_plan_id: "commission_plan_change",
  commission_plan_version: "commission_plan_change",
  commission_rate: "commission_rate_change",
  commission_effective_date: "commission_rate_change",
  stripe_account_id: "stripe_account_created",
  stripe_onboarding_status: "stripe_onboarding_change",
  stripe_payouts_enabled: "stripe_payouts_change",
};

// Most significant first — used to pick the primary event when many change at once.
const PRIORITY = [
  "termination_entered",
  "employment_status_change",
  "stripe_payouts_change",
  "stripe_onboarding_change",
  "stripe_account_created",
  "commission_plan_change",
  "commission_rate_change",
  "address_change",
  "phone_change",
  "personal_email_change",
  "legal_name_change",
  "work_state_change",
  "job_title_change",
  "offer_accepted",
  "employee_activated",
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const evt = payload.event || {};
    const entityId = evt.entity_id;
    const type = evt.type;
    if (!entityId) return Response.json({ skipped: true, reason: "no entity_id" });

    let events = [];
    let changedFields = [];

    if (type === "create") {
      // First time this employee exists in Arriv One → initial payroll record.
      const data = payload.data || {};
      events = [data.employment_status === "active" ? "employee_activated" : "offer_accepted"];
      changedFields = ["__initial_create__"];
    } else if (type === "update") {
      const changed = payload.changed_fields || [];
      for (const field of changed) {
        const evType = FIELD_TO_EVENT[field];
        if (!evType) continue;
        // Termination is its own event type
        if ((field === "employment_status" || field === "employment_classification") && (payload.data?.[field] === "terminated")) {
          if (!events.includes("termination_entered")) events.push("termination_entered");
        } else {
          if (!events.includes(evType)) events.push(evType);
        }
        changedFields.push(field);
      }
    }

    if (!events.length) return Response.json({ skipped: true, reason: "no mapped changes" });

    const member = await base44.asServiceRole.entities.SalesTeamMember.get(entityId);
    if (!member) return Response.json({ skipped: true, reason: "member not found" });

    const withId = await ensureEmployeeId(base44, member);

    // Increment source_record_version on real change events (not the initial create).
    let versioned = withId;
    if (type === "update") {
      const nextVersion = (withId.source_record_version || 1) + 1;
      await base44.asServiceRole.entities.SalesTeamMember.update(withId.id, { source_record_version: nextVersion });
      versioned = { ...withId, source_record_version: nextVersion };
    }

    const primary = events.slice().sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b))[0];
    const queueRecord = await enqueueSync(base44, versioned, primary, changedFields);
    const result = await runSyncAttempt(base44, queueRecord);

    await writeAuditLog(base44, {
      actor: "system",
      action: `entity_auto_sync:${primary}`,
      entityType: "SalesTeamMember",
      entityId,
      afterValues: { events, changed_fields: changedFields, source_record_version: versioned.source_record_version },
      destinationApplication: "arriv_payroll",
      result: result.ok ? "success" : result.nonRetryable ? "failure" : "warning",
    });

    // Auto-start W-2 orientation on first creation (offer accepted). Contractors skip.
    if (type === "create" && (versioned.employment_classification || "w2_employee") === "w2_employee") {
      try {
        await startOrientation(base44, versioned, { actor: "system", actorRole: "system", applicationId: versioned.application_id || "" });
      } catch (e) {
        console.error("auto orientation start failed:", e.message);
      }
    }

    return Response.json({ success: true, events, primary, sync: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});