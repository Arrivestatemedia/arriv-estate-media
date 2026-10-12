// Core employee-sync logic shared by the syncEmployee admin function, the
// processEmployeeSyncQueue scheduled processor, and any function that triggers
// a sync. Never calls Arriv Payroll from browser code — only server-side functions use this.

import {
  generateRequestId,
  generateEmployeeId,
  generateSyncId,
  isNonRetryableError,
  backoffDelayMs,
} from "./payrollCrypto.ts";
// Outbound requests to the Arriv Payroll API are signed over the 4-field canonical string
// (body\ntimestamp\nrequestId\nsourceAppId). That is the convention payrollSigning.ts uses
// for every other outbound payroll call, and the one the payroll app verifies (see the note
// on verifyCanonicalRequest in payrollCrypto.ts). Signing employee syncs over the 5-field
// variant — which appended employeeVersion to the signed bytes — meant this route rejected
// every attempt as "Invalid signature", while the same secret authenticated the sibling
// routes that were already signed over the 4-field string. The employee version still
// travels to the payroll app as the X-Arriv-Employee-Version header below.
import { signRequest as signPayrollRequest } from "./payrollSigning.ts";
import { getPayrollConfig } from "./payrollSettings.ts";
import { writeAuditLog } from "./payrollAudit.ts";

// Split the member's real full name into first/last parts. Used only where the dedicated
// legal-name fields are blank — Arriv Payroll requires them non-empty, and a member synced
// from Arriv One often carries only full_name. Nothing is invented: the parts come from the
// member's own name.
function namePartsFrom(member) {
  const full = String(member.full_name || "").trim().replace(/\s+/g, " ");
  if (!full) return { first: "", last: "" };
  const parts = full.split(" ");
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// Fields Arriv One syncs to Arriv Payroll. Never includes bank accounts, full SSNs,
// or Stripe secrets — those are collected via hosted Stripe onboarding.
export function buildEmployeePayload(member) {
  const nameParts = namePartsFrom(member);
  return {
    arriv_employee_id: member.arriv_employee_id || "",
    legal_first_name: member.legal_first_name || nameParts.first,
    legal_middle_name: member.legal_middle_name || "",
    legal_last_name: member.legal_last_name || nameParts.last,
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
    // The payroll route names this field `hire_date`; sent alongside the two source fields so
    // the payroll app receives it under the name it validates. Never defaulted to a date this
    // app cannot evidence — an empty value is reported back rather than guessed.
    hire_date: member.current_effective_hire_date || member.original_hire_date || "",
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

// Owner/administrator accounts hold no payroll employment relationship. They are excluded
// from employee synchronization on their own explicit classification — never on `role`, so
// administrative access alone neither makes an account a payroll employee nor removes a
// genuine employee from payroll. Returns the exclusion reason, or null when sync is allowed.
export function payrollSyncExclusion(member) {
  if (!member) return null;
  if (member.account_classification === "owner_administrator") return "OWNER_ADMINISTRATOR";
  if (member.payroll_sync_eligible === false) {
    return member.payroll_sync_exclusion_reason || "PAYROLL_SYNC_INELIGIBLE";
  }
  return null;
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
  // A non-payroll owner/administrator account never enters the queue, so it cannot be sent
  // to Arriv Payroll and cannot be retried.
  const exclusion = payrollSyncExclusion(member);
  if (exclusion) {
    return {
      excluded: true,
      exclusion_reason: exclusion,
      sync_id: null,
      arriv_employee_id: member.arriv_employee_id || null,
      event_type: eventType,
      current_field_values: {},
    };
  }
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
  if (queueRecord?.excluded) {
    return { ok: false, terminal: true, nonRetryable: true, excluded: true, exclusion_reason: queueRecord.exclusion_reason };
  }

  // Never transmit an account classified as a non-payroll owner/administrator. The live
  // employee record is checked here too, so a queue record written before the classification
  // (or by an older path) is terminalised instead of being sent.
  const resolvedMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({
    arriv_employee_id: queueRecord.arriv_employee_id,
  });
  const resolvedEmployee = resolvedMembers && resolvedMembers.length ? resolvedMembers[0] : null;
  const exclusionReason = payrollSyncExclusion(resolvedEmployee);
  if (exclusionReason) {
    const excludedAt = new Date().toISOString();
    await base44.asServiceRole.entities.EmployeeSyncQueue.update(queueRecord.id, {
      processing_status: "requires_review",
      hold_reason: "OWNER_ADMINISTRATOR",
      hold_detail: "Account is classified as owner/administrator with no payroll employment relationship, so it is excluded from employee synchronization. Not transmitted to Arriv Payroll.",
      held_at: excludedAt,
      completed_timestamp: excludedAt,
      non_retryable: true,
      next_attempt_at: null,
    });
    await base44.asServiceRole.entities.SalesTeamMember.update(resolvedEmployee.id, {
      payroll_sync_status: "not_synced",
      payroll_sync_error: "",
    });
    return { ok: false, terminal: true, nonRetryable: true, excluded: true, exclusion_reason: exclusionReason };
  }

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
  // Source-app identity the payroll app has registered for this integration. Read from
  // configuration because the value belongs to the payroll side's app registry: the receiver
  // answered "Invalid source_app" when this was hardcoded. The signature must cover exactly
  // the same value, and the body carries it too, because the receiver compares all three.
  // Arriv Pay has confirmed this exact production identifier (underscores, not hyphens).
  const sourceAppId = config.source_app || "arriv_estate_media";
  const employeeVersion = queueRecord.source_version || 1;
  const bodyStr = JSON.stringify({
    // The receiver reads the employee fields at the top level of the payload, so the record
    // is sent both flattened and under `employee`. Declared values come after the spread so
    // the run's own identity fields always win.
    ...(queueRecord.current_field_values || {}),
    company_id: config.company_id,
    // Sent explicitly so the payload's source app and the signed source app are the same
    // value; the receiver checks them against each other.
    source_app: sourceAppId,
    // The receiver requires the request id inside the payload as well as in the signed header.
    request_id: requestId,
    arriv_employee_id: queueRecord.arriv_employee_id,
    event_type: queueRecord.event_type,
    event_timestamp: queueRecord.event_timestamp,
    source_version: employeeVersion,
    changed_fields: queueRecord.changed_fields || [],
    employee: queueRecord.current_field_values,
  });

  const signature = await signPayrollRequest(config.apiSecret, {
    body: bodyStr,
    timestamp: now,
    requestId,
    sourceAppId,
  });

  const base = config.endpoint.replace(/\/functions\/.*$/i, "").replace(/\/$/, "");
  // Verified against the live Arriv Payroll app: the deployed employee-sync route is
  // receiveEmployeeSync. receiveEmployee is not deployed there and returns
  // "Backend function 'receiveEmployee' not found or not deployed".
  const url = base + "/functions/receiveEmployeeSync";

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
      const syncFields = {
        payroll_sync_status: "synced",
        payroll_sync_error: "",
        payroll_last_synced_at: new Date().toISOString(),
        last_successful_sync_timestamp: new Date().toISOString(),
      };
      // When Arriv Payroll returns the employee identifier it acknowledged, keep it: it is
      // the positive evidence that this employee record exists in Arriv Payroll. Never
      // synthesised here — an absent identifier leaves the stored one untouched.
      const ackEmployeeId =
        respData.payroll_employee_id || respData.employee_id || (respData.employee && respData.employee.payroll_employee_id) || "";
      if (ackEmployeeId) syncFields.payroll_employee_id = String(ackEmployeeId);
      await base44.asServiceRole.entities.SalesTeamMember.update(members[0].id, syncFields);
      await base44.asServiceRole.entities.EmployeeSyncQueue.update(queueRecord.id, {
        payroll_employee_id: ackEmployeeId ? String(ackEmployeeId) : (queueRecord.payroll_employee_id || ""),
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