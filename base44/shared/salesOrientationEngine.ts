// Sales orientation + payroll-enrollment engine. Joins Arriv One employees to
// Arriv Payroll via the immutable ARRIV_EMPLOYEE_ID. Never stores tax answers,
// full SSNs, or bank-account numbers — those live in Arriv Payroll / Stripe.

import {
  signRequest,
  generateRequestId,
  isTimestampFresh,
  verifySignature,
} from "./payrollCrypto.ts";
import { getPayrollConfig } from "./payrollSettings.ts";
import { ensureEmployeeId, enqueueSync, runSyncAttempt } from "./payrollEmployeeSync.ts";

export const ORIENTATION_DEADLINE_DAYS = 14;

// Required employment documents (config). Each new version forces a new ack task.
export const REQUIRED_DOCUMENTS = [
  { id: "employment_agreement", title: "Employment Agreement", version: "v1" },
  { id: "commission_compensation_agreement", title: "Commission Compensation Agreement", version: "v1" },
  { id: "confidentiality_agreement", title: "Confidentiality Agreement", version: "v1" },
  { id: "acceptable_use_policy", title: "Acceptable-Use Policy", version: "v1" },
  { id: "employee_handbook_acknowledgment", title: "Employee Handbook Acknowledgment", version: "v1" },
  { id: "data_security_policy", title: "Data-Security Policy", version: "v1" },
  { id: "device_equipment_policy", title: "Device / Equipment Policy", version: "v1" },
  { id: "communication_consent_policy", title: "Communication-Consent Policy", version: "v1" },
  { id: "payroll_schedule_acknowledgment", title: "Payroll Schedule Acknowledgment", version: "v1" },
];

export const REQUIRED_TRAINING = [
  { id: "arriv_one_usage", title: "Arriv One Usage" },
  { id: "customer_data_protection", title: "Customer-Data Protection" },
  { id: "password_account_security", title: "Password & Account Security" },
  { id: "sales_process", title: "Sales Process" },
  { id: "commission_eligibility", title: "Commission Eligibility" },
  { id: "anti_harassment_conduct", title: "Anti-Harassment & Workplace Conduct" },
  { id: "payroll_schedule", title: "Payroll Schedule" },
  { id: "reporting_concerns", title: "Reporting Payroll or Commission Concerns" },
];

// Safe inbound readiness statuses (the only tax/payroll states Arriv One stores).
export const READINESS_EVENTS = {
  PAYROLL_EMPLOYEE_CREATED: "payroll_employee_created",
  PAYROLL_PROFILE_INCOMPLETE: "payroll_profile_incomplete",
  FEDERAL_TAX_SETUP_COMPLETE: "federal_tax_setup_complete",
  STATE_TAX_SETUP_COMPLETE: "state_tax_setup_complete",
  TAX_SETUP_REQUIRES_REVIEW: "tax_setup_requires_review",
  STRIPE_ONBOARDING_STARTED: "stripe_onboarding_started",
  STRIPE_REQUIREMENTS_OUTSTANDING: "stripe_requirements_outstanding",
  STRIPE_PAYOUTS_ENABLED: "stripe_payouts_enabled",
  STRIPE_PAYOUTS_DISABLED: "stripe_payouts_disabled",
  PAYROLL_HOLD_APPLIED: "payroll_hold_applied",
  PAYROLL_HOLD_RELEASED: "payroll_hold_released",
  PAYROLL_READY: "payroll_ready",
  PAYROLL_READINESS_REVOKED: "payroll_readiness_revoked",
};

export async function writeOrientationAudit(base44, entry) {
  const {
    arrivEmployeeId,
    actor = "system",
    role = "system",
    action,
    section = "",
    affectedRecord = "",
    previousStatus = "",
    newStatus = "",
    requestId = "",
    sourceApplication = "arriv_one",
    result = "success",
    safeFailureMessage = "",
  } = entry;
  return base44.asServiceRole.entities.OrientationAuditLog.create({
    event_id: "oevt_" + crypto.randomUUID(),
    arriv_employee_id: arrivEmployeeId,
    actor,
    role,
    action,
    orientation_section: section,
    affected_record: affectedRecord,
    previous_status: previousStatus,
    new_status: newStatus,
    timestamp: new Date().toISOString(),
    request_id: requestId,
    source_application: sourceApplication,
    result,
    safe_failure_message: safeFailureMessage,
  });
}

// Idempotently create a SalesOrientation for a W-2 employee on offer acceptance.
export async function startOrientation(base44, member, options = {}) {
  if (!member) return { error: "member required" };
  const classification = member.employment_classification || "w2_employee";
  if (classification !== "w2_employee") {
    return { skipped: true, reason: "not a w2_employee" };
  }

  const withId = await ensureEmployeeId(base44, member);
  const existing = await base44.asServiceRole.entities.SalesOrientation.filter({
    arriv_employee_id: withId.arriv_employee_id,
  });
  if (existing && existing.length) {
    return { skipped: true, reason: "orientation already exists", orientation: existing[0] };
  }

  const now = new Date();
  const deadline = options.orientationDeadline || isoDate(new Date(now.getTime() + ORIENTATION_DEADLINE_DAYS * 86400000));
  const orientationId = "orient_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const orientation = await base44.asServiceRole.entities.SalesOrientation.create({
    orientation_id: orientationId,
    arriv_employee_id: withId.arriv_employee_id,
    sales_member_id: withId.id,
    application_id: options.applicationId || "",
    employee_email: withId.email || withId.personal_email || "",
    employee_name: withId.full_name || "",
    status: "invited",
    employment_classification: classification,
    anticipated_start_date: withId.current_effective_hire_date || withId.original_hire_date || options.startDate || "",
    orientation_deadline: deadline,
    expected_first_payroll_date: options.expectedFirstPayrollDate || "",
    manager: withId.manager_id || options.manager || "",
    department: withId.department || "Sales",
    job_title: withId.title || "Sales Growth Advisor",
    documents_required_count: REQUIRED_DOCUMENTS.length,
    background_check_status: "not_started",
    i9_status: "employee_section_not_started",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });

  // Enqueue the initial employee sync to Arriv Payroll (creates the payroll profile).
  let syncResult = null;
  try {
    const queue = await enqueueSync(base44, withId, "offer_accepted", ["__initial_orientation__"]);
    syncResult = await runSyncAttempt(base44, queue);
  } catch (e) {
    syncResult = { ok: false, error: e.message };
  }

  await writeOrientationAudit(base44, {
    arrivEmployeeId: withId.arriv_employee_id,
    actor: options.actor || "system",
    role: options.actorRole || "system",
    action: "orientation_created",
    section: "welcome",
    affectedRecord: orientationId,
    newStatus: "invited",
  });

  return { success: true, orientation, syncResult };
}

// Weighted readiness. Payroll-blocking items dominate; a single blocker caps the
// percentage well below 100 even if all optional orientation items are done.
export function computeReadiness(o) {
  if (!o) return { percent: 0, completed: [], missing: [], blocked: [] };
  const completed = [];
  const missing = [];
  const blocked = [];

  const check = (label, ok, blocking = false) => {
    if (ok) completed.push(label);
    else {
      (blocking ? blocked : missing).push(label);
    }
  };

  check("Welcome acknowledged", !!o.welcome_acknowledged_at);
  check("Personal & employment info", o.personal_info_status === "submitted" || o.personal_info_status === "reviewed");
  check("Employee record synchronized", !!o.employee_record_synced, true);
  check("Background check clear", o.background_check_status === "clear", true);
  check("I-9 employee section", ["employee_section_complete","employer_review_scheduled","employer_review_complete","complete"].includes(o.i9_status));
  check("I-9 employer verification", ["employer_review_complete","complete"].includes(o.i9_status), true);
  check("Payroll profile created", !!o.payroll_profile_created, true);
  check("Federal tax setup", o.federal_tax_status === "complete", true);
  check("State tax setup", !o.state_tax_required || o.state_tax_status === "complete", o.state_tax_required);
  check("Stripe onboarding", ["payouts_enabled","complete"].includes(o.stripe_onboarding_status), true);
  check("Direct deposit (payouts enabled)", !!o.payouts_enabled, true);
  check("Employment documents", !!o.documents_complete);
  check("Required training", o.training_status === "complete");
  check("Owner / HR final review", o.final_review_status === "approved");
  check("Arriv Payroll payroll_ready", !!o.payroll_ready, true);

  if (o.payroll_hold) blocked.push("Payroll hold active");

  const total = completed.length + missing.length + blocked.length;
  const blockingWeight = 3; // blockers count 3x so a single blocker cannot reach 100%
  const weightedTotal = completed.length + missing.length + blocked.length * blockingWeight;
  const percent = weightedTotal ? Math.round((completed.length / weightedTotal) * 100) : 0;

  let nextAction = "Begin orientation";
  if (blocked.length) nextAction = blocked[0];
  else if (missing.length) nextAction = missing[0];

  return { percent, completed, missing, blocked, nextAction };
}

// Request a short-lived, single-use enrollment session from Arriv Payroll.
// Server-side only; no secrets in the redirect URL.
export async function requestEnrollmentSession(base44, orientation, sessionType, returnUrl, actor) {
  const config = await getPayrollConfig(base44);
  if (!config.endpoint) return { error: "Arriv Payroll API endpoint not configured" };
  if (!config.apiSecret) return { error: "Arriv Payroll API secret not configured" };

  const requestId = generateRequestId();
  const sourceAppId = "arriv-one";
  const now = new Date().toISOString();
  const bodyStr = JSON.stringify({
    company_id: config.company_id,
    arriv_employee_id: orientation.arriv_employee_id,
    session_type: sessionType,
    return_url: returnUrl,
    request_id: requestId,
  });
  const signature = await signRequest(config.apiSecret, {
    body: bodyStr,
    timestamp: now,
    requestId,
    sourceAppId,
    employeeVersion: orientation.arriv_employee_id,
  });
  const base = config.endpoint.replace(/\/functions\/.*$/i, "").replace(/\/$/, "");
  const url = base + "/functions/createEnrollmentSession";

  const sessionId = "pes_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const sessionRecord = await base44.asServiceRole.entities.PayrollEnrollmentSession.create({
    session_id: sessionId,
    arriv_employee_id: orientation.arriv_employee_id,
    orientation_id: orientation.orientation_id,
    session_type: sessionType,
    request_id: requestId,
    status: "pending",
    expires_at: expiresAt,
    issuer_actor: actor || "employee",
    return_url: returnUrl,
    issued_at: now,
  });

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arriv-Signature": signature,
        "X-Arriv-Timestamp": now,
        "X-Arriv-Request-Id": requestId,
        "X-Arriv-Source-App": sourceAppId,
        "X-Arriv-Employee-Id": orientation.arriv_employee_id,
      },
      body: bodyStr,
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data && data.enrollment_url) {
      await base44.asServiceRole.entities.PayrollEnrollmentSession.update(sessionRecord.id, {
        status: "issued",
        enrollment_url: data.enrollment_url,
        expires_at: data.expires_at || expiresAt,
      });
      await writeOrientationAudit(base44, {
        arrivEmployeeId: orientation.arriv_employee_id,
        actor: actor || "employee",
        role: "employee",
        action: sessionType === "direct_deposit" ? "direct_deposit_session_issued" : "payroll_enrollment_session_issued",
        section: sessionType === "direct_deposit" ? "direct_deposit" : "payroll_tax_enrollment",
        affectedRecord: sessionId,
        requestId,
        destinationApplication: "arriv_payroll",
      });
      return { success: true, session_id: sessionId, enrollment_url: data.enrollment_url, expires_at: data.expires_at || expiresAt };
    }
    await base44.asServiceRole.entities.PayrollEnrollmentSession.update(sessionRecord.id, {
      status: "failed",
    });
    return { error: (data && (data.error || data.message)) || `Payroll returned ${resp.status}` };
  } catch (err) {
    await base44.asServiceRole.entities.PayrollEnrollmentSession.update(sessionRecord.id, { status: "failed" });
    return { error: "Payroll unreachable", details: err.message };
  }
}

// Verify a signed inbound readiness message from Arriv Payroll.
export async function verifyReadinessMessage(secret, { rawBody, signature, timestamp, requestId, sourceAppId, employeeId, eventId }) {
  if (!signature) return { ok: false, reason: "missing signature" };
  if (!isTimestampFresh(timestamp)) return { ok: false, reason: "stale timestamp" };
  const canonical = [rawBody || "", timestamp || "", requestId || "", sourceAppId || "", employeeId || "", eventId || ""].join("\n");
  const valid = await verifySignature(secret, canonical, signature);
  return valid ? { ok: true } : { ok: false, reason: "invalid signature" };
}

function isoDate(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

// Apply a safe readiness event to an orientation + the linked SalesTeamMember.
export async function applyReadinessEvent(base44, orientation, evt) {
  const now = new Date().toISOString();
  const update = { updated_at: now };
  const memberUpdate = {};

  switch (evt.event_type) {
    case READINESS_EVENTS.PAYROLL_EMPLOYEE_CREATED:
      update.payroll_profile_created = true;
      update.employee_record_synced = true;
      break;
    case READINESS_EVENTS.PAYROLL_PROFILE_INCOMPLETE:
      update.payroll_profile_created = false;
      break;
    case READINESS_EVENTS.FEDERAL_TAX_SETUP_COMPLETE:
      update.federal_tax_status = "complete";
      break;
    case READINESS_EVENTS.STATE_TAX_SETUP_COMPLETE:
      update.state_tax_status = "complete";
      update.state_tax_required = true;
      break;
    case READINESS_EVENTS.TAX_SETUP_REQUIRES_REVIEW:
      update.tax_requires_review = true;
      update.federal_tax_status = "requires_review";
      break;
    case READINESS_EVENTS.STRIPE_ONBOARDING_STARTED:
      update.stripe_onboarding_status = "onboarding_started";
      memberUpdate.stripe_onboarding_status = "in_progress";
      break;
    case READINESS_EVENTS.STRIPE_REQUIREMENTS_OUTSTANDING:
      update.stripe_onboarding_status = "information_required";
      memberUpdate.stripe_onboarding_status = "incomplete";
      break;
    case READINESS_EVENTS.STRIPE_PAYOUTS_ENABLED:
      update.stripe_onboarding_status = "payouts_enabled";
      update.payouts_enabled = true;
      memberUpdate.stripe_payouts_enabled = true;
      memberUpdate.stripe_onboarding_status = "complete";
      break;
    case READINESS_EVENTS.STRIPE_PAYOUTS_DISABLED:
      update.stripe_onboarding_status = "payouts_disabled";
      update.payouts_enabled = false;
      memberUpdate.stripe_payouts_enabled = false;
      break;
    case READINESS_EVENTS.PAYROLL_HOLD_APPLIED:
      update.payroll_hold = true;
      update.payroll_hold_reason = evt.payload?.reason || "";
      update.payroll_ready = false;
      break;
    case READINESS_EVENTS.PAYROLL_HOLD_RELEASED:
      update.payroll_hold = false;
      update.payroll_hold_reason = "";
      break;
    case READINESS_EVENTS.PAYROLL_READY:
      update.payroll_ready = true;
      update.payroll_ready_at = now;
      break;
    case READINESS_EVENTS.PAYROLL_READINESS_REVOKED:
      update.payroll_ready = false;
      update.payroll_ready_at = "";
      break;
    default:
      break;
  }

  // Recompute tax_setup_complete
  const fed = update.federal_tax_status || orientation.federal_tax_status;
  const state = update.state_tax_status || orientation.state_tax_status;
  const stateOk = !((update.state_tax_required ?? orientation.state_tax_required)) || state === "complete";
  update.tax_setup_complete = fed === "complete" && stateOk && !update.tax_requires_review && !orientation.tax_requires_review;

  await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, update);

  if (Object.keys(memberUpdate).length && orientation.sales_member_id) {
    try {
      await base44.asServiceRole.entities.SalesTeamMember.update(orientation.sales_member_id, memberUpdate);
    } catch (_e) { /* best-effort */ }
  }

  return update;
}

// Start a Checkr background check for a sales rep, mirroring the media-specialist
// flow. Stores the candidate/invitation ids on the orientation record. Manual mode
// (no Checkr key) alerts the admin to invite the candidate in the Checkr dashboard.
export async function initiateSalesBackgroundCheck(base44, orientation, member) {
  const CHECKR_BASE = "https://api.checkr.com/v1";
  const apiKey = Deno.env.get("CHECKR_API_KEY");
  const nowIso = new Date().toISOString();

  if (orientation.background_check_status === "clear") return { success: true, alreadyCleared: true };
  if (orientation.checkr_invitation_url && orientation.background_check_status === "pending") {
    return { success: true, invitation_url: orientation.checkr_invitation_url, reused: true };
  }

  if (!apiKey) {
    await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, {
      background_check_status: "pending",
      background_check_initiated_at: nowIso,
    });
    await writeOrientationAudit(base44, {
      arrivEmployeeId: orientation.arriv_employee_id,
      actor: "system",
      role: "system",
      action: "background_check_manual_pending",
      section: "background_check",
      affectedRecord: orientation.orientation_id,
      newStatus: "pending",
    });
    return { success: true, manual: true };
  }

  const fullName = (member.full_name || "").trim();
  const parts = fullName.split(/\s+/);
  const firstName = parts[0] || "Sales";
  const lastName = parts.slice(1).join(" ") || "Rep";
  const checkrAuth = "Basic " + btoa(apiKey + ":");

  const candRes = await fetch(CHECKR_BASE + "/candidates", {
    method: "POST",
    headers: { Authorization: checkrAuth, "Content-Type": "application/json" },
    body: JSON.stringify({ first_name: firstName, last_name: lastName, email: member.email, copy_requested: true }),
  });
  if (!candRes.ok) return { error: "Checkr candidate creation failed" };
  const candidate = await candRes.json();

  const pkg = Deno.env.get("CHECKR_PACKAGE") || "tasker_standard";
  const invRes = await fetch(CHECKR_BASE + "/invitations", {
    method: "POST",
    headers: { Authorization: checkrAuth, "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_id: candidate.id, package: pkg }),
  });
  if (!invRes.ok) return { error: "Checkr invitation creation failed" };
  const invitation = await invRes.json();

  await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, {
    checkr_candidate_id: candidate.id,
    checkr_invitation_url: invitation.invitation_url,
    background_check_status: "pending",
    background_check_initiated_at: nowIso,
  });
  await writeOrientationAudit(base44, {
    arrivEmployeeId: orientation.arriv_employee_id,
    actor: "system",
    role: "system",
    action: "background_check_invited",
    section: "background_check",
    affectedRecord: orientation.orientation_id,
    newStatus: "pending",
  });
  return { success: true, invitation_url: invitation.invitation_url };
}

// Determine whether all Arriv One orientation requirements + payroll_ready are met.
export function isOrientationComplete(o) {
  if (!o) return false;
  return (
    !!o.welcome_acknowledged_at &&
    (o.personal_info_status === "submitted" || o.personal_info_status === "reviewed") &&
    !!o.employee_record_synced &&
    o.background_check_status === "clear" &&
    ["employer_review_complete","complete"].includes(o.i9_status) &&
    !!o.payroll_profile_created &&
    o.federal_tax_status === "complete" &&
    (!o.state_tax_required || o.state_tax_status === "complete") &&
    ["payouts_enabled","complete"].includes(o.stripe_onboarding_status) &&
    !!o.payouts_enabled &&
    !!o.documents_complete &&
    o.training_status === "complete" &&
    o.final_review_status === "approved" &&
    !!o.payroll_ready &&
    !o.payroll_hold
  );
}