// Core employee-sync logic shared by the syncEmployee admin function, the
// processEmployeeSyncQueue scheduled processor, and any function that triggers
// a sync. Never calls Arriv Payroll from browser code — only server-side functions use this.

import {
  signRequest,
  generateRequestId,
  generateEmployeeId,
  generateSyncId,
  isNonRetryableError,
  backoffDelayMs,
} from "./payrollCrypto.ts";
import { getPayrollConfig } from "./payrollSettings.ts";
import { writeAuditLog } from "./payrollAudit.ts";

// Fields Arriv One syncs to Arriv Payroll. Never includes bank accounts, full SSNs,
// or Stripe secrets — those are collected via hosted Stripe onboarding.
export function buildEmployeePayload(member) {
  return {
    arriv_employee_id: member.arriv_employee_id || "",
    legal_first_name: member.legal_first_name || "",
    legal_middle_name: member.legal_middle_name || "",
    legal_last_name: member.legal_last_name || "",
    preferred_name: member.preferred_name || member.full_name || "",
    personal_email: member.personal_email || member.email || "",
    company_email: member.company_email || "",
    mobile_phone_number: member.mobile_phone_number || member.phone_number || "",
    home_address: member.home_address || "",
    city: member.employee_city || "",
    state: member.employee_state || "",
    zip: member.employee_zip || "",
    country: member.employee_country || "US",
    employment_classification: member.employment_classification || "w2_employee",
    job_title: member.title || "Sales Growth Advisor",
    department: member.department || "Sales",
    employment_status: member.employment_status || "pending_offer",
    original_hire_date: member.original_hire_date || "",
    current_effective_hire_date: member.current_effective_hire_date || "",
    termination_date: member.termination_date || "",
    payroll_eligible: member.payroll_eligible === true,
    compensation_type: member.compensation_type || "commission_only",
    commission_plan_id: member.commission_plan_id || "",
    commission_plan_version: member.commission_plan_version || 0,
    commission_rate: member.commission_rate || 0,
    commission_effective_date: member.commission_effective_date || "",
    manager: member.manager_id || "",
    work_state: member.work_state || "",
    primary_work_location: member.primary_work_location || "",
    stripe_account_id: member.stripe_account_id || "",
    stripe_onboarding_status: member.stripe_onboarding_status || "not_started",
    stripe_payouts_enabled: member.stripe_payouts_enabled === true,
    source_record_version: member.source_record_version || 1,
  };
}

// Assign an immutable ARRIV_EMPLOYEE_ID if the member does not yet have one.
export async function ensureEmployeeId(base44, member) {
  if (member.arriv_employee_id) return member;
  const arrivEmployeeId = generateEmployeeId();
  await base44.asServiceRole.entities.SalesTeamMember.update(member.id, {
    arriv_employee_id: arrivEmployeeId,
    payroll_sync_status: "syncing",
  });
  return { ...member, arriv_employee_id: arrivEmployeeId };
}

// Create an EmployeeSyncQueue record and return it.
export async function enqueueSync(base44, member, eventType, changedFields) {
  const now = new Date().toISOString();
  return base44.asServiceRole.entities.EmployeeSyncQueue.create({
    sync_id: generateSyncId(),
    arriv_employee_id: member.arriv_employee_id,
    event_type: eventType,
    event_timestamp: now,
    source_version: member.source_record_version || 1,
    changed_fields: changedFields || [],
    current_field_values: buildEmployeePayload(member),
    destination: "arriv_payroll",
    processing_status: "queued",
    attempt_count: 0,
    max_attempts: 5,
    non_retryable: false,
  });
}

async function markFailed(base44, queueRecord, responseCode, responseMessage, nonRetryable) {
  const attemptNum = (queueRecord.attempt_count || 0) + 1;
  const max = queueRecord.max_attempts || 5;
  const terminal = nonRetryable || attemptNum >= max;
  const update = {
    processing_status: terminal ? (nonRetryable ? "requires_review" : "failed") : "failed",
    non_retryable: nonRetryable,
    response_code: String(responseCode || ""),
    response_message: String(responseMessage || ""),
    last_attempt_at: new Date().toISOString(),
  };
  if (!terminal) {
    update.next_attempt_at = new Date(Date.now() + backoffDelayMs(attemptNum)).toISOString();
  } else {
    update.completed_timestamp = new Date().toISOString();
  }
  await base44.asServiceRole.entities.EmployeeSyncQueue.update(queueRecord.id, update);
  return { ok: false, terminal, nonRetryable };
}

// Run a single sync attempt for an existing queue record. Returns { ok, terminal }.
export async function runSyncAttempt(base44, queueRecord) {
  const config = await getPayrollConfig(base44);
  if (!config.endpoint) {
    return markFailed(base44, queueRecord, null, "Arriv Payroll API endpoint not configured", false);
  }
  if (!config.apiSecret) {
    return markFailed(base44, queueRecord, null, "Arriv Payroll API secret not configured", true);
  }

  const attemptNum = (queueRecord.attempt_count || 0) + 1;
  const now = new Date().toISOString();
  await base44.asServiceRole.entities.EmployeeSyncQueue.update(queueRecord.id, {
    processing_status: "processing",
    attempt_count: attemptNum,
    last_attempt_at: now,
    next_attempt_at: null,
  });

  const requestId = generateRequestId();
  const sourceAppId = "arriv-one";
  const employeeVersion = queueRecord.source_version || 1;
  const bodyStr = JSON.stringify({
    company_id: config.company_id,
    event_type: queueRecord.event_type,
    changed_fields: queueRecord.changed_fields || [],
    employee: queueRecord.current_field_values,
  });

  const signature = await signRequest(config.apiSecret, {
    body: bodyStr,
    timestamp: now,
    requestId,
    sourceAppId,
    employeeVersion,
  });

  const base = config.endpoint.replace(/\/functions\/.*$/i, "").replace(/\/$/, "");
  const url = base + "/functions/receiveEmployee";

  let resp;
  let respData;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arriv-Signature": signature,
        "X-Arriv-Timestamp": now,
        "X-Arriv-Request-Id": requestId,
        "X-Arriv-Source-App": sourceAppId,
        "X-Arriv-Employee-Version": String(employeeVersion),
      },
      body: bodyStr,
    });
    respData = await resp.json().catch(() => ({}));
  } catch (err) {
    await writeAuditLog(base44, {
      actor: "system",
      action: "employee_sync_network_error",
      entityType: "EmployeeSyncQueue",
      entityId: queueRecord.id,
      requestId,
      destinationApplication: "arriv_payroll",
      result: "failure",
    });
    return markFailed(base44, queueRecord, null, `Payroll unreachable: ${err.message}`, false);
  }

  if (resp.ok && respData && respData.success) {
    await base44.asServiceRole.entities.EmployeeSyncQueue.update(queueRecord.id, {
      processing_status: "synchronized",
      response_code: String(resp.status),
      response_message: respData.message || "synchronized",
      completed_timestamp: new Date().toISOString(),
      non_retryable: false,
    });
    // Reflect success on the employee record
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({
      arriv_employee_id: queueRecord.arriv_employee_id,
    });
    if (members && members.length) {
      await base44.asServiceRole.entities.SalesTeamMember.update(members[0].id, {
        payroll_sync_status: "synced",
        payroll_sync_error: "",
        payroll_last_synced_at: new Date().toISOString(),
        last_successful_sync_timestamp: new Date().toISOString(),
      });
    }
    await writeAuditLog(base44, {
      actor: "system",
      action: "employee_sync_synchronized",
      entityType: "SalesTeamMember",
      entityId: queueRecord.arriv_employee_id,
      requestId,
      destinationApplication: "arriv_payroll",
      result: "success",
    });
    return { ok: true, terminal: true };
  }

  // Payroll rejected/failed
  const nonRetryable = isNonRetryableError(resp.status, respData && (respData.error || respData.message));
  const errMsg =
    (respData && (respData.error || respData.message)) ||
    `Payroll rejected with status ${resp.status}`;
  await writeAuditLog(base44, {
    actor: "system",
    action: "employee_sync_rejected",
    entityType: "EmployeeSyncQueue",
    entityId: queueRecord.id,
    requestId,
    destinationApplication: "arriv_payroll",
    result: nonRetryable ? "failure" : "warning",
  });
  const members = await base44.asServiceRole.entities.SalesTeamMember.filter({
    arriv_employee_id: queueRecord.arriv_employee_id,
  });
  if (members && members.length) {
    await base44.asServiceRole.entities.SalesTeamMember.update(members[0].id, {
      payroll_sync_status: "error",
      payroll_sync_error: errMsg,
    });
  }
  return markFailed(base44, queueRecord, resp.status, errMsg, nonRetryable);
}