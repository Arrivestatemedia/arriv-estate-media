import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { buildSignedHeaders } from "../../shared/payrollSigning.ts";

// ─── Payroll config (single-tenant: app-level secrets) ─────────────────────
function getPayrollConfig() {
  const endpoint = secrets.get("ARRIV_PAYROLL_ENDPOINT") || "";
  const apiSecret = secrets.get("ARRIV_PAYROLL_API_SECRET") || "";
  const companyId = secrets.get("ARRIV_PAYROLL_COMPANY_ID") || "";
  const benefitsPortalUrl = secrets.get("ARRIV_PAYROLL_BENEFITS_PORTAL_URL") || "";
  const enabled = !!companyId && !!apiSecret;
  return { endpoint, companyId, enabled, apiSecret, benefitsPortalUrl };
}

// ─── Arriv Payroll Benefits API proxy ───────────────────────────────────────
async function callPayrollBenefitsApi(config, action, payload) {
  const body = { ...payload, action, company_id: config.companyId };
  const bodyStr = JSON.stringify(body);
  const sourceAppId = "arriv-estate-media";
  const headers = await buildSignedHeaders(config.apiSecret, bodyStr, sourceAppId);

  const base = config.endpoint.replace(/\/functions\/.*$/i, "").replace(/\/$/, "");
  const url = base + "/functions/benefits";

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: bodyStr,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Payroll Benefits API error: ${resp.status}`);
  return data;
}

// ─── Main handler ─────────────────────────────────────────────────────────
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case "get_overview": return await getOverview(base44, params);
      case "get_open_enrollment": return await getOpenEnrollment(base44, params);
      case "get_total_compensation": return await getTotalCompensation(base44, params);
      case "submit_life_event": return await submitLifeEvent(base44, params);
      case "get_life_events": return await getLifeEvents(base44, params);
      case "get_reimbursements": return await getReimbursements(base44, params);
      case "get_notifications": return await getNotifications(base44, params);
      case "ask_ai": return await askAi(base44, params);
      default: return Response.json({ error: "Unknown action: " + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
async function getMember(base44, salesMemberId) {
  const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
  return members && members[0] ? members[0] : null;
}

function getDefaultOverview() {
  return {
    enrollment_status: "not_enrolled",
    plan_summary: null,
    deductions: { per_paycheck: 0, annual: 0 },
    dependents: [],
    beneficiaries: [],
    coverage_levels: {},
    next_enrollment_window: null,
  };
}

function getDefaultReimbursements() {
  return {
    accounts: [],
    total_available: 0,
    total_ytd_used: 0,
  };
}

// ─── Action: get_overview ──────────────────────────────────────────────────
async function getOverview(base44, { sales_member_id }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const config = getPayrollConfig();
  if (config.enabled && member.arriv_employee_id) {
    try {
      const result = await callPayrollBenefitsApi(config, "get_overview", {
        employee_id: member.arriv_employee_id,
      });
      return Response.json({
        overview: result.overview || getDefaultOverview(),
        benefits_portal_url: config.benefitsPortalUrl,
        source: "arriv_payroll",
      });
    } catch (err) {
      return Response.json({
        overview: getDefaultOverview(),
        benefits_portal_url: config.benefitsPortalUrl,
        source: "local",
        error: err.message,
      });
    }
  }
  return Response.json({
    overview: getDefaultOverview(),
    benefits_portal_url: config.benefitsPortalUrl,
    source: "local",
  });
}

// ─── Action: get_open_enrollment ───────────────────────────────────────────
async function getOpenEnrollment(base44, { sales_member_id }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const config = getPayrollConfig();
  if (config.enabled && member.arriv_employee_id) {
    try {
      const result = await callPayrollBenefitsApi(config, "get_open_enrollment", {
        employee_id: member.arriv_employee_id,
      });
      return Response.json({
        open_enrollment: result.open_enrollment || null,
        benefits_portal_url: config.benefitsPortalUrl,
        source: "arriv_payroll",
      });
    } catch (err) {
      return Response.json({
        open_enrollment: null,
        benefits_portal_url: config.benefitsPortalUrl,
        source: "local",
        error: err.message,
      });
    }
  }
  return Response.json({
    open_enrollment: null,
    benefits_portal_url: config.benefitsPortalUrl,
    source: "local",
  });
}

// ─── Action: get_total_compensation ───────────────────────────────────────
async function getTotalCompensation(base44, { sales_member_id }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  // Build local compensation baseline from the employee record
  const compType = member.compensation_type || "commission_only";
  const commissionRate = member.commission_rate || 0;
  const localBase = {
    compensation_type: compType,
    commission_rate: commissionRate,
    base_salary: compType === "base_plus_commission" ? 0 : compType === "salary" ? 0 : 0,
    estimated_annual_commission: 0,
    benefits_value: 0,
    total_estimated: 0,
  };

  const config = getPayrollConfig();
  if (config.enabled && member.arriv_employee_id) {
    try {
      const result = await callPayrollBenefitsApi(config, "get_total_compensation", {
        employee_id: member.arriv_employee_id,
      });
      return Response.json({
        compensation: result.compensation || localBase,
        source: "arriv_payroll",
      });
    } catch (err) {
      return Response.json({ compensation: localBase, source: "local", error: err.message });
    }
  }
  return Response.json({ compensation: localBase, source: "local" });
}

// ─── Action: submit_life_event ────────────────────────────────────────────
async function submitLifeEvent(base44, params) {
  const { sales_member_id, event_type, event_date, affected_benefits, description } = params;
  if (!sales_member_id || !event_type || !event_date) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const config = getPayrollConfig();
  const lifeEventId = "le_" + crypto.randomUUID();
  let payrollReference = "";
  let secureWorkflowUrl = "";
  let payrollSyncStatus = "not_synced";
  let payrollSyncError = "";

  if (config.enabled && member.arriv_employee_id) {
    try {
      const result = await callPayrollBenefitsApi(config, "submit_life_event", {
        employee_id: member.arriv_employee_id,
        event_type,
        event_date,
        affected_benefits: affected_benefits || [],
        description: description || "",
      });
      payrollReference = result?.payroll_reference || "";
      secureWorkflowUrl = result?.secure_workflow_url || "";
      payrollSyncStatus = "synced";
    } catch (err) {
      payrollSyncStatus = "error";
      payrollSyncError = err.message;
    }
  }

  const record = await base44.asServiceRole.entities.BenefitsLifeEvent.create({
    life_event_id: lifeEventId,
    employee_id: sales_member_id,
    employee_name: member.full_name,
    arriv_employee_id: member.arriv_employee_id || "",
    event_type,
    event_date,
    affected_benefits: affected_benefits || [],
    description: description || "",
    status: payrollSyncStatus === "synced" ? "submitted_to_payroll" : "pending",
    payroll_reference: payrollReference,
    secure_workflow_url: secureWorkflowUrl,
    payroll_sync_status: payrollSyncStatus,
    payroll_sync_error: payrollSyncError,
    submitted_at: payrollSyncStatus === "synced" ? new Date().toISOString() : "",
    created_at: new Date().toISOString(),
  });

  return Response.json({ life_event: record });
}

// ─── Action: get_life_events ───────────────────────────────────────────────
async function getLifeEvents(base44, { sales_member_id }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const events = await base44.asServiceRole.entities.BenefitsLifeEvent.filter(
    { employee_id: sales_member_id }, "-created_at", 100
  );

  return Response.json({ life_events: events || [] });
}

// ─── Action: get_reimbursements ────────────────────────────────────────────
async function getReimbursements(base44, { sales_member_id }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const config = getPayrollConfig();
  if (config.enabled && member.arriv_employee_id) {
    try {
      const result = await callPayrollBenefitsApi(config, "get_reimbursements", {
        employee_id: member.arriv_employee_id,
      });
      return Response.json({
        reimbursements: result.reimbursements || getDefaultReimbursements(),
        benefits_portal_url: config.benefitsPortalUrl,
        source: "arriv_payroll",
      });
    } catch (err) {
      return Response.json({
        reimbursements: getDefaultReimbursements(),
        benefits_portal_url: config.benefitsPortalUrl,
        source: "local",
        error: err.message,
      });
    }
  }
  return Response.json({
    reimbursements: getDefaultReimbursements(),
    benefits_portal_url: config.benefitsPortalUrl,
    source: "local",
  });
}

// ─── Action: get_notifications ─────────────────────────────────────────────
async function getNotifications(base44, { sales_member_id }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const config = getPayrollConfig();
  let payrollNotifications = [];

  if (config.enabled && member.arriv_employee_id) {
    try {
      const result = await callPayrollBenefitsApi(config, "get_notifications", {
        employee_id: member.arriv_employee_id,
      });
      payrollNotifications = result.notifications || [];
    } catch (_) { /* Fall back to local-only notifications */ }
  }

  // Local notifications from life event status changes
  const events = await base44.asServiceRole.entities.BenefitsLifeEvent.filter(
    { employee_id: sales_member_id }, "-created_at", 20
  );

  const localNotifications = (events || []).map((e) => {
    if (e.status === "submitted_to_payroll" && e.secure_workflow_url) {
      return {
        type: "action_required",
        title: "Complete your life event changes",
        message: `Your ${e.event_type.replace(/_/g, " ")} life event requires action. Click the secure link to update your benefits.`,
        link: e.secure_workflow_url,
        link_label: "Open Secure Workflow",
        date: e.submitted_at || e.created_at,
      };
    }
    if (e.status === "processed") {
      return {
        type: "info",
        title: "Life event processed",
        message: `Your ${e.event_type.replace(/_/g, " ")} life event has been processed.`,
        date: e.updated_date || e.created_at,
      };
    }
    if (e.status === "denied") {
      return {
        type: "alert",
        title: "Life event denied",
        message: `Your ${e.event_type.replace(/_/g, " ")} life event was denied. Please contact HR.`,
        date: e.updated_date || e.created_at,
      };
    }
    return null;
  }).filter(Boolean);

  return Response.json({
    notifications: [...payrollNotifications, ...localNotifications],
  });
}

// ─── Action: ask_ai (Benefits AI Assistant) ───────────────────────────────
async function askAi(base44, { sales_member_id, question }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  if (!question) return Response.json({ error: "question required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  // Gather context: overview, life events, open enrollment
  const config = getPayrollConfig();
  let overview = getDefaultOverview();
  let openEnrollment = null;

  if (config.enabled && member.arriv_employee_id) {
    try {
      const [ovRes, oeRes] = await Promise.all([
        callPayrollBenefitsApi(config, "get_overview", { employee_id: member.arriv_employee_id }),
        callPayrollBenefitsApi(config, "get_open_enrollment", { employee_id: member.arriv_employee_id }),
      ]);
      overview = ovRes.overview || overview;
      openEnrollment = oeRes.open_enrollment || null;
    } catch (_) {}
  }

  const lifeEvents = await base44.asServiceRole.entities.BenefitsLifeEvent.filter(
    { employee_id: sales_member_id }, "-created_at", 10
  );

  const context = [
    `Employee: ${member.full_name} (${member.title || "Sales Growth Advisor"})`,
    `Employment classification: ${member.employment_classification || "w2_employee"}`,
    `Compensation type: ${member.compensation_type || "commission_only"}`,
    `Enrollment status: ${overview.enrollment_status}`,
    `Plan summary: ${JSON.stringify(overview.plan_summary || {})}`,
    `Deductions per paycheck: $${(overview.deductions?.per_paycheck || 0).toFixed(2)}`,
    `Annual deductions: $${(overview.deductions?.annual || 0).toFixed(2)}`,
    `Dependents: ${(overview.dependents || []).length}`,
    `Open enrollment: ${openEnrollment ? JSON.stringify(openEnrollment) : "none active"}`,
    `Recent life events: ${(lifeEvents || []).map((e) => `${e.event_type} (${e.status})`).join(", ") || "none"}`,
    `Benefits portal: ${config.benefitsPortalUrl || "not configured"}`,
  ].join("\n");

  const prompt = `You are a helpful benefits assistant for Arriv Estate Media employees. Answer the employee's question about their benefits clearly and concisely. If the question requires action (e.g. updating beneficiaries, submitting a life event, enrolling), direct them to the benefits portal or the appropriate section in the app.

Employee context:
${context}

Employee question: ${question}

Provide a helpful, accurate answer. If you don't know something specific about their plan, direct them to the benefits portal or HR. Keep the response under 200 words.`;

  const res = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        action_label: { type: "string", description: "Optional button label if action is needed" },
        action_url: { type: "string", description: "Optional URL to direct the employee to" },
      },
    },
  });

  return Response.json({ response: res });
}