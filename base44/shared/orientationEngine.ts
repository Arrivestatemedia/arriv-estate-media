// Shared server-side logic for the New Employee Orientation & Payroll Enrollment
// workflow for sales reps. All entity access uses the service role so RLS
// (admin-only direct access) does not block these functions. Never stores SSNs,
// bank accounts, or tax answers — only safe status enums.

import { signRequest, generateRequestId } from "./payrollCrypto.ts";
import { getPayrollConfig } from "./payrollSettings.ts";
import { sendBrevoEmail } from "./brevoClient.ts";

export function genId(prefix) {
  return prefix + crypto.randomUUID();
}

export async function writeOrientationAudit(base44, evt) {
  try {
    await base44.asServiceRole.entities.OrientationAuditLog.create({
      event_id: genId("audit_"),
      arriv_employee_id: evt.arriv_employee_id || "",
      actor: evt.actor || "system",
      role: evt.role || "system",
      action: evt.action,
      orientation_section: evt.section || "",
      affected_record: evt.affected_record || "",
      previous_status: evt.previous_status || "",
      new_status: evt.new_status || "",
      timestamp: new Date().toISOString(),
      request_id: evt.request_id || "",
      source_application: evt.source_application || "arriv_one",
      result: evt.result || "success",
      safe_failure_message: evt.safe_failure_message || "",
    });
  } catch (e) {
    console.error("orientation audit log failed:", e.message);
  }
}

const DEFAULT_DOCUMENTS = [
  { document_id: "employment_agreement", title: "Employment Agreement", version: "1.0", required: true },
  { document_id: "employee_handbook_ack", title: "Employee Handbook Acknowledgment", version: "1.0", required: true },
  { document_id: "confidentiality_agreement", title: "Confidentiality Agreement", version: "1.0", required: true },
  { document_id: "commission_plan_ack", title: "Commission Plan Acknowledgment", version: "1.0", required: true },
];

export async function getActiveDocumentTemplates(base44) {
  let templates = [];
  try {
    templates = await base44.asServiceRole.entities.OrientationDocumentTemplate.filter({ active: true });
  } catch (e) { /* entity may be missing in tests */ }
  if (!templates || !templates.length) return DEFAULT_DOCUMENTS;
  const byId = {};
  for (const t of templates) {
    if (!byId[t.document_id] || String(t.version) > String(byId[t.document_id].version)) byId[t.document_id] = t;
  }
  return Object.values(byId).map((t) => ({
    document_id: t.document_id,
    title: t.title,
    version: String(t.version),
    required: t.required !== false,
  }));
}

export async function getActiveTrainingModules(base44) {
  let mods = [];
  try {
    mods = await base44.asServiceRole.entities.TrainingModule.filter({ active: true });
  } catch (e) {}
  if (!mods || !mods.length) return [];
  return mods.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function buildDocumentList(base44, o) {
  const templates = await getActiveDocumentTemplates(base44);
  let signed = [];
  try {
    signed = await base44.asServiceRole.entities.OrientationDocument.filter({
      arriv_employee_id: o.arriv_employee_id,
      status: "signed",
    });
  } catch (e) {}
  return templates.map((t) => {
    const s = signed.find((x) => x.document_id === t.document_id && String(x.document_version) === t.version);
    return { id: t.document_id, version: t.version, title: t.title, required: t.required, signed: !!s, signed_record_id: s ? s.id : null };
  });
}

export async function buildTrainingList(base44, o) {
  const modules = await getActiveTrainingModules(base44);
  let completions = [];
  try {
    completions = await base44.asServiceRole.entities.TrainingCompletion.filter({ arriv_employee_id: o.arriv_employee_id });
  } catch (e) {}
  return modules.map((m) => {
    const c = completions.find((x) => x.module_id === m.module_id);
    return {
      id: m.module_id,
      title: m.title,
      description: m.description || "",
      order: m.order || 0,
      quiz: m.quiz_questions || [],
      passing_score: m.passing_score != null ? m.passing_score : 70,
      complete: !!(c && c.passed),
      score: c ? c.score : null,
      attempts: c ? c.attempts || 0 : 0,
    };
  });
}

export function computeReadiness(o) {
  const sections = [
    { key: "welcome", label: "Welcome acknowledgment", done: !!o.welcome_acknowledged_at },
    { key: "personal_info", label: "Personal & employment info", done: o.personal_info_status === "submitted" },
    { key: "background_check", label: "Background check", done: o.background_check_status === "clear" },
    { key: "i9", label: "I-9 employment eligibility", done: ["employer_review_complete", "complete"].includes(o.i9_status) },
    { key: "tax", label: "Payroll & tax setup", done: o.federal_tax_status === "complete" && (!o.state_tax_required || o.state_tax_status === "complete") },
    { key: "direct_deposit", label: "Direct deposit", done: !!o.payouts_enabled },
    { key: "documents", label: "Employment documents", done: !!o.documents_complete },
    { key: "training", label: "Training", done: o.training_status === "complete" },
  ];
  const completed = sections.filter((s) => s.done).map((s) => s.label);
  const missing = sections.filter((s) => !s.done).map((s) => s.label);
  const blocked = [];
  if (o.payroll_hold) blocked.push("Payroll hold active");
  const total = sections.length + 1;
  let doneCount = completed.length;
  if (o.final_review_status === "approved" && o.payroll_ready) {
    doneCount += 1;
    completed.push("Final review & payroll-ready");
  } else {
    missing.push("Final review & payroll-ready approval");
  }
  const percent = Math.round((doneCount / total) * 100);

  let nextAction = "Orientation complete — you're payroll-ready.";
  if (!o.welcome_acknowledged_at) nextAction = "Acknowledge the welcome section to begin.";
  else if (o.personal_info_status !== "submitted") nextAction = "Review and submit your personal & employment info.";
  else if (o.background_check_status !== "clear") nextAction = "Complete your background check.";
  else if (!["employer_review_complete", "complete"].includes(o.i9_status)) nextAction = "Complete the I-9 employee section and present documents.";
  else if (o.federal_tax_status !== "complete" || (o.state_tax_required && o.state_tax_status !== "complete")) nextAction = "Complete payroll & tax setup in Arriv Payroll.";
  else if (!o.payouts_enabled) nextAction = "Set up direct deposit.";
  else if (!o.documents_complete) nextAction = "Acknowledge your employment documents.";
  else if (o.training_status !== "complete") nextAction = "Complete training.";
  else if (o.final_review_status !== "approved" || !o.payroll_ready) nextAction = "Awaiting owner/HR final review and payroll-ready confirmation.";

  return { percent, completed, missing, blocked, nextAction };
}

export async function recomputeOrientation(base44, o) {
  const docs = await buildDocumentList(base44, o);
  const requiredDocs = docs.filter((d) => d.required);
  const documents_complete = requiredDocs.length > 0 && requiredDocs.every((d) => d.signed);
  const documents_completed_count = docs.filter((d) => d.signed).length;
  const documents_required_count = requiredDocs.length;

  const training = await buildTrainingList(base44, o);
  const totalModules = training.length;
  const doneModules = training.filter((t) => t.complete).length;
  const training_completion_percent = totalModules ? Math.round((doneModules / totalModules) * 100) : (o.training_status === "complete" ? 100 : 0);
  const training_status = totalModules ? (doneModules >= totalModules ? "complete" : (doneModules > 0 ? "in_progress" : "not_started")) : (o.training_status === "complete" ? "complete" : "not_started");

  const r = computeReadiness({ ...o, documents_complete, training_status });
  let status = o.status;
  if (o.payroll_hold) status = "blocked";
  else if (r.percent === 100 && o.payroll_ready && o.final_review_status === "approved") status = "completed";
  else if (o.status === "completed" && r.percent < 100) status = "in_progress";
  else if (["not_started", "invited"].includes(o.status)) status = "in_progress";

  const update = {
    documents_complete,
    documents_completed_count,
    documents_required_count,
    training_completion_percent,
    training_status,
    readiness_percent: r.percent,
    status,
    updated_at: new Date().toISOString(),
  };
  await base44.asServiceRole.entities.SalesOrientation.update(o.id, update);
  return { ...o, ...update };
}

export async function getOrientationBundle(base44, salesMemberId) {
  if (!salesMemberId) throw new Error("sales_member_id is required");
  const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
  const member = members && members[0];
  if (!member) throw new Error("Sales team member not found");
  if (!member.arriv_employee_id) throw new Error("Employee has no ARRIV_EMPLOYEE_ID");
  const orientations = await base44.asServiceRole.entities.SalesOrientation.filter({ sales_member_id: salesMemberId });
  let orientation = orientations && orientations[0];
  if (!orientation) {
    orientation = await startOrientation(base44, member, { actor: "system" });
  }
  const documents = await buildDocumentList(base44, orientation);
  const training = await buildTrainingList(base44, orientation);
  const readiness = computeReadiness(orientation);
  return { orientation, employee: { id: member.id, full_name: member.full_name, email: member.email, arriv_employee_id: member.arriv_employee_id }, documents, training, readiness };
}

function defaultDeadline(startDate) {
  const base = startDate ? new Date(startDate) : new Date();
  if (isNaN(base.getTime())) return new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  return new Date(base.getTime() + 7 * 86400000).toISOString().slice(0, 10);
}

export async function startOrientation(base44, member, opts = {}) {
  if (!member.arriv_employee_id) throw new Error("Employee has no ARRIV_EMPLOYEE_ID");
  const existing = await base44.asServiceRole.entities.SalesOrientation.filter({ arriv_employee_id: member.arriv_employee_id });
  if (existing && existing[0]) {
    if (existing[0].status === "not_started") {
      await base44.asServiceRole.entities.SalesOrientation.update(existing[0].id, { status: "invited", updated_at: new Date().toISOString() });
    }
    return existing[0];
  }
  const startDate = member.current_effective_hire_date || member.original_hire_date || "";
  const orientation = await base44.asServiceRole.entities.SalesOrientation.create({
    orientation_id: genId("orient_"),
    arriv_employee_id: member.arriv_employee_id,
    sales_member_id: member.id,
    application_id: opts.application_id || "",
    employee_email: member.personal_email || member.email || "",
    employee_name: member.legal_last_name ? `${member.legal_first_name || ""} ${member.legal_last_name}`.trim() : member.full_name || "",
    status: "invited",
    employment_classification: member.employment_classification || "w2_employee",
    anticipated_start_date: startDate,
    orientation_deadline: opts.deadline || defaultDeadline(startDate),
    expected_first_payroll_date: opts.expected_first_payroll_date || "",
    manager: member.manager_id || "",
    department: member.department || "Sales",
    job_title: member.title || "Sales Growth Advisor",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await writeOrientationAudit(base44, { arriv_employee_id: member.arriv_employee_id, actor: opts.actor || "system", action: "orientation_started", affected_record: orientation.id, new_status: "invited" });
  return orientation;
}

export async function recordDocumentSign(base44, { orientation, document_id, document_version, signature_method, signature_value, actor }) {
  let prior = [];
  try {
    prior = await base44.asServiceRole.entities.OrientationDocument.filter({ arriv_employee_id: orientation.arriv_employee_id, document_id, status: "signed" });
  } catch (e) {}
  for (const p of prior) {
    if (String(p.document_version) !== String(document_version)) {
      await base44.asServiceRole.entities.OrientationDocument.update(p.id, { status: "voided", superseded_by: String(document_version) });
    }
  }
  const rec = await base44.asServiceRole.entities.OrientationDocument.create({
    document_id,
    document_version: String(document_version),
    arriv_employee_id: orientation.arriv_employee_id,
    orientation_id: orientation.id,
    displayed_at: new Date().toISOString(),
    signed_at: new Date().toISOString(),
    signature_method: signature_method || "clickwrap",
    signature_value: signature_value || "",
    status: "signed",
  });
  await writeOrientationAudit(base44, { arriv_employee_id: orientation.arriv_employee_id, actor: actor || "employee", role: "employee", action: "document_signed", section: document_id, affected_record: rec.id, new_status: "signed" });
  const refreshed = await base44.asServiceRole.entities.SalesOrientation.get(orientation.id);
  return recomputeOrientation(base44, refreshed);
}

export async function completeSection(base44, orientation, section, actor) {
  const now = new Date().toISOString();
  const prev = orientation.status;
  const update = { updated_at: now };
  if (section === "welcome") update.welcome_acknowledged_at = now;
  else if (section === "personal_info_submit") {
    update.personal_info_status = "submitted";
    update.personal_info_submitted_at = now;
    update.employee_record_synced = true;
  } else if (section === "i9_employee_complete") {
    update.i9_status = "employee_section_complete";
    update.i9_employee_completed_at = now;
  } else if (section === "training_complete") {
    update.training_status = "complete";
  } else throw new Error("Unknown section: " + section);
  await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, update);
  await writeOrientationAudit(base44, { arriv_employee_id: orientation.arriv_employee_id, actor: actor || "employee", role: "employee", action: "section_completed", section, previous_status: prev });
  const refreshed = await base44.asServiceRole.entities.SalesOrientation.get(orientation.id);
  return recomputeOrientation(base44, refreshed);
}

export async function adminReviewOrientation(base44, orientation, action, extra = {}, actor) {
  const now = new Date().toISOString();
  const prev = orientation.status;
  const update = { updated_at: now };
  if (action === "i9_complete") {
    update.i9_status = "employer_review_complete";
    update.i9_employer_completed_at = now;
    update.i9_employer_reviewer_id = actor || "admin";
    if (extra.i9_reverification_date) update.i9_reverification_date = extra.i9_reverification_date;
  } else if (action === "i9_reverification") {
    update.i9_status = "reverification_required";
    if (extra.i9_reverification_date) update.i9_reverification_date = extra.i9_reverification_date;
  } else if (action === "i9_reject") {
    update.i9_status = "rejected";
  } else if (action === "final_approve") {
    update.final_review_status = "approved";
    update.final_reviewed_by = actor || "admin";
    update.final_reviewed_at = now;
    if (orientation.payroll_ready) {
      update.status = "completed";
      update.completed_at = now;
    }
  } else if (action === "final_reject") {
    update.final_review_status = "rejected";
    update.final_reviewed_by = actor || "admin";
    update.final_reviewed_at = now;
  } else if (action === "hold_apply") {
    update.payroll_hold = true;
    update.payroll_hold_reason = extra.hold_reason || "Manual hold";
    update.status = "blocked";
  } else if (action === "hold_release") {
    update.payroll_hold = false;
    update.payroll_hold_reason = "";
  } else if (action === "background_result") {
    update.background_check_status = extra.background_result || "clear";
    update.background_check_completed_at = now;
  } else throw new Error("Unknown action: " + action);
  await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, update);
  await writeOrientationAudit(base44, { arriv_employee_id: orientation.arriv_employee_id, actor: actor || "admin", role: "admin", action: "admin_review_" + action, affected_record: orientation.id, previous_status: prev, new_status: update.status || prev });
  const refreshed = await base44.asServiceRole.entities.SalesOrientation.get(orientation.id);
  return recomputeOrientation(base44, refreshed);
}

export async function recordTrainingScore(base44, { orientation, module_id, module_version, score, passed, answer_summary }) {
  const now = new Date().toISOString();
  let existing = [];
  try {
    existing = await base44.asServiceRole.entities.TrainingCompletion.filter({ arriv_employee_id: orientation.arriv_employee_id, module_id });
  } catch (e) {}
  let recId;
  if (existing && existing[0]) {
    const upd = await base44.asServiceRole.entities.TrainingCompletion.update(existing[0].id, {
      module_version,
      score,
      passed,
      attempts: (existing[0].attempts || 0) + 1,
      last_answer_summary: answer_summary || {},
      completed_at: now,
    });
    recId = existing[0].id;
  } else {
    const rec = await base44.asServiceRole.entities.TrainingCompletion.create({
      completion_id: genId("train_"),
      arriv_employee_id: orientation.arriv_employee_id,
      orientation_id: orientation.id,
      module_id,
      module_version,
      score,
      passed,
      attempts: 1,
      last_answer_summary: answer_summary || {},
      completed_at: now,
    });
    recId = rec.id;
  }
  await writeOrientationAudit(base44, { arriv_employee_id: orientation.arriv_employee_id, actor: "employee", role: "employee", action: "training_module_scored", section: module_id, affected_record: recId, new_status: passed ? "passed" : "failed" });
  const refreshed = await base44.asServiceRole.entities.SalesOrientation.get(orientation.id);
  return recomputeOrientation(base44, refreshed);
}

export async function createEnrollmentSession(base44, { orientation, sessionType, returnUrl, actor }) {
  const config = await getPayrollConfig(base44);
  if (!config.endpoint || !config.apiSecret) throw new Error("Arriv Payroll API not configured");
  const requestId = generateRequestId();
  const sessionId = genId("sess_");
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const bodyStr = JSON.stringify({
    company_id: config.company_id,
    arriv_employee_id: orientation.arriv_employee_id,
    session_type: sessionType,
    return_url: returnUrl || "",
    session_id: sessionId,
  });
  const signature = await signRequest(config.apiSecret, { body: bodyStr, timestamp: now, requestId, sourceAppId: "arriv-one", employeeVersion: 1 });
  const base = config.endpoint.replace(/\/functions\/.*$/i, "").replace(/\/$/, "");
  const url = base + "/functions/createEnrollmentSession";
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
        "X-Arriv-Source-App": "arriv-one",
        "X-Arriv-Employee-Version": "1",
      },
      body: bodyStr,
    });
    respData = await resp.json().catch(() => ({}));
  } catch (e) {
    await base44.asServiceRole.entities.PayrollEnrollmentSession.create({
      session_id: sessionId, arriv_employee_id: orientation.arriv_employee_id, orientation_id: orientation.id,
      session_type: sessionType, request_id: requestId, status: "failed", enrollment_url: "", expires_at: expires,
      issued_at: now, issuer_actor: actor || "employee", return_url: returnUrl || "",
    });
    throw new Error("Arriv Payroll unreachable: " + e.message);
  }
  const enrollmentUrl = respData && respData.enrollment_url ? respData.enrollment_url : "";
  await base44.asServiceRole.entities.PayrollEnrollmentSession.create({
    session_id: sessionId, arriv_employee_id: orientation.arriv_employee_id, orientation_id: orientation.id,
    session_type: sessionType, request_id: requestId, status: resp.ok ? "issued" : "failed",
    enrollment_url: enrollmentUrl, expires_at: expires, issued_at: now, issuer_actor: actor || "employee", return_url: returnUrl || "",
  });
  if (!resp.ok || !enrollmentUrl) throw new Error((respData && respData.error) || "Arriv Payroll did not return an enrollment URL");
  await writeOrientationAudit(base44, { arriv_employee_id: orientation.arriv_employee_id, actor: actor || "employee", role: "employee", action: "enrollment_session_issued", section: sessionType, affected_record: sessionId });
  return { session_id: sessionId, enrollment_url: enrollmentUrl, expires_at: expires };
}

// Safe status payload only — strip anything that could contain tax answers, SSNs, or banking.
export function sanitizeReadinessPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const allowed = ["status", "federal_tax_status", "state_tax_status", "stripe_onboarding_status", "payouts_enabled", "payroll_ready", "payroll_profile_created", "hold_reason", "employee_id", "arriv_employee_id", "event_type"];
  const out = {};
  for (const k of Object.keys(payload)) {
    if (allowed.includes(k)) out[k] = payload[k];
  }
  return out;
}

export const READINESS_EVENT_MAP = {
  payroll_employee_created: { set: { payroll_profile_created: true } },
  federal_tax_setup_complete: { set: { federal_tax_status: "complete", tax_setup_complete: true } },
  state_tax_setup_complete: { set: { state_tax_status: "complete", tax_setup_complete: true } },
  stripe_payouts_enabled: { set: { stripe_onboarding_status: "payouts_enabled", payouts_enabled: true } },
  payroll_ready: { set: { payroll_ready: true } },
  payroll_readiness_revoked: { set: { payroll_ready: false } },
  payroll_hold_applied: { set: { payroll_hold: true } },
  payroll_hold_released: { set: { payroll_hold: false, payroll_hold_reason: "" } },
};

export async function initiateSalesBackgroundCheck(base44, { orientation, member }) {
  const apiKey = Deno.env.get("CHECKR_API_KEY");
  const now = new Date().toISOString();
  if (!apiKey) {
    await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, { background_check_status: "pending", background_check_initiated_at: now });
    await writeOrientationAudit(base44, { arriv_employee_id: orientation.arriv_employee_id, actor: "employee", role: "employee", action: "background_check_manual", section: "background_check", new_status: "pending" });
    return { manual: true, message: "Admin will invite you via Checkr." };
  }
  const fullName = (member.legal_last_name ? `${member.legal_first_name || ""} ${member.legal_last_name}`.trim() : member.full_name || "").trim();
  const parts = fullName.split(/\s+/);
  const firstName = parts[0] || "Employee";
  const lastName = parts.slice(1).join(" ") || "Employee";
  const email = member.personal_email || member.email;
  const candRes = await fetch("https://api.checkr.com/v1/candidates", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(apiKey + ":"), "Content-Type": "application/json" },
    body: JSON.stringify({ first_name: firstName, last_name: lastName, email, copy_requested: true }),
  });
  if (!candRes.ok) throw new Error("Could not start background check with screening partner.");
  const candidate = await candRes.json();
  const pkg = Deno.env.get("CHECKR_PACKAGE") || "tasker_standard";
  const invRes = await fetch("https://api.checkr.com/v1/invitations", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(apiKey + ":"), "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_id: candidate.id, package: pkg }),
  });
  if (!invRes.ok) throw new Error("Could not start background check with screening partner.");
  const invitation = await invRes.json();
  await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, {
    background_check_status: "pending",
    background_check_initiated_at: now,
    checkr_candidate_id: candidate.id,
    checkr_invitation_url: invitation.invitation_url,
  });
  await writeOrientationAudit(base44, { arriv_employee_id: orientation.arriv_employee_id, actor: "employee", role: "employee", action: "background_check_invited", section: "background_check", affected_record: candidate.id, new_status: "pending" });
  return { invitation_url: invitation.invitation_url };
}

// Apply a Checkr webhook report result to a sales orientation (if candidate matches).
export async function applyCheckrResultToOrientation(base44, { candidateId, status, reportId }) {
  let orientations = [];
  try {
    orientations = await base44.asServiceRole.entities.SalesOrientation.filter({ checkr_candidate_id: candidateId });
  } catch (e) {}
  const o = orientations && orientations[0];
  if (!o) return null;
  const now = new Date().toISOString();
  if (status === "clear") {
    await base44.asServiceRole.entities.SalesOrientation.update(o.id, { background_check_status: "clear", background_check_completed_at: now });
  } else if (status === "consider" || status === "suspended") {
    await base44.asServiceRole.entities.SalesOrientation.update(o.id, { background_check_status: "failed", background_check_completed_at: now });
  }
  await writeOrientationAudit(base44, { arriv_employee_id: o.arriv_employee_id, actor: "checkr", role: "system", action: "background_check_result", section: "background_check", new_status: status });
  return { applied: true, status };
}

export async function sendDeadlineReminders(base44) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  let orientations = [];
  try {
    orientations = await base44.asServiceRole.entities.SalesOrientation.filter({ status: { $ne: "completed" } });
  } catch (e) {}
  const adminEmail = Deno.env.get("ADMIN_EMAIL");
  const sent = [];
  for (const o of orientations || []) {
    if (!o.orientation_deadline) continue;
    const deadline = new Date(o.orientation_deadline);
    if (isNaN(deadline.getTime())) continue;
    const daysAway = Math.round((deadline.getTime() - today.getTime()) / 86400000);
    const overdue = daysAway < 0;
    const dueSoon = daysAway >= 0 && daysAway <= 3;
    if (!overdue && !dueSoon) continue;
    const readiness = computeReadiness(o);
    const subject = overdue
      ? `OVERDUE: Sales orientation past deadline — ${o.employee_name}`
      : `Reminder: Sales orientation deadline in ${daysAway} day(s) — ${o.employee_name}`;
    // Employee reminder via Brevo (external email allowed)
    if (o.employee_email) {
      try {
        await sendBrevoEmail({
          to: o.employee_email,
          subject: overdue ? "Action needed: your Arriv orientation is overdue" : "Reminder: complete your Arriv orientation",
          htmlContent: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1A1A1A">
            <h2 style="color:#B8956A">Arriv Orientation ${overdue ? "Overdue" : "Reminder"}</h2>
            <p>Hi ${o.employee_name || "there"},</p>
            <p>Your new-employee orientation is ${overdue ? "<strong>past its deadline</strong>" : `due in <strong>${daysAway} day(s)</strong>`} (deadline: ${o.orientation_deadline}).</p>
            <p>Current readiness: <strong>${readiness.percent}%</strong>. Next step: ${readiness.nextAction}</p>
            <p>Please log in to your Arriv sales portal to continue.</p>
            <p style="color:#888;font-size:12px;margin-top:24px">— Arriv Estate Media</p>
          </div>`,
        });
      } catch (e) { /* ignore */ }
    }
    // Owner/HR alert via SendEmail (registered admin)
    if (adminEmail) {
      try {
        await base44.integrations.Core.SendEmail({
          to: adminEmail,
          subject,
          body: `<div style="font-family:Arial,sans-serif;color:#1A1A1A">
            <p><strong>${o.employee_name}</strong> (${o.arriv_employee_id})</p>
            <p>Deadline: ${o.orientation_deadline} — ${overdue ? "OVERDUE by " + Math.abs(daysAway) + " day(s)" : "due in " + daysAway + " day(s)"}</p>
            <p>Readiness: ${readiness.percent}%. Missing: ${readiness.missing.join(", ") || "none"}. ${o.payroll_hold ? "PAYROLL HOLD active." : ""}</p>
          </div>`,
        });
      } catch (e) { /* ignore */ }
    }
    sent.push({ arriv_employee_id: o.arriv_employee_id, daysAway, overdue });
  }
  return { sent, count: sent.length };
}