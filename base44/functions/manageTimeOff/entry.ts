import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

// ─── Payroll config (single-tenant: app-level secrets) ─────────────────────
function getPayrollConfig() {
  const endpoint = secrets.get("ARRIV_PAYROLL_ENDPOINT") || "";
  const apiSecret = secrets.get("ARRIV_PAYROLL_API_SECRET") || "";
  const webhookSecret = secrets.get("ARRIV_PAYROLL_WEBHOOK_SECRET") || "";
  const companyId = secrets.get("ARRIV_PAYROLL_COMPANY_ID") || "";
  const enabled = !!companyId && !!apiSecret;
  return { endpoint, companyId, enabled, apiSecret, webhookSecret };
}

// ─── HMAC signing ──────────────────────────────────────────────────────────
const enc = new TextEncoder();

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signPayload(secret, body) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return toHex(sig);
}

function canonicalString({ body, timestamp, requestId, sourceAppId }) {
  return [body || "", timestamp || "", requestId || "", sourceAppId || ""].join("\n");
}

async function signRequest(secret, { body, timestamp, requestId, sourceAppId }) {
  return signPayload(secret, canonicalString({ body, timestamp, requestId, sourceAppId }));
}

// ─── Arriv Payroll API proxy ───────────────────────────────────────────────
async function callPayrollApi(config, action, payload) {
  const body = { ...payload, action };
  const bodyStr = JSON.stringify(body);
  const now = new Date().toISOString();
  const requestId = "req_" + crypto.randomUUID();
  const sourceAppId = "arriv-estate-media";
  const signature = await signRequest(config.apiSecret, { body: bodyStr, timestamp: now, requestId, sourceAppId });

  const base = config.endpoint.replace(/\/functions\/.*$/i, "").replace(/\/$/, "");
  const url = base + "/functions/timeOff";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Arriv-Signature": signature,
      "X-Arriv-Timestamp": now,
      "X-Arriv-Request-Id": requestId,
      "X-Arriv-Source-App": sourceAppId,
    },
    body: bodyStr,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Payroll API error: ${resp.status}`);
  return data;
}

// ─── Main handler ─────────────────────────────────────────────────────────
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case "get_balances": return await getBalances(base44, params);
      case "get_my_requests": return await getMyRequests(base44, params);
      case "submit_request": return await submitRequest(base44, params);
      case "approve_request": return await actionRequest(base44, params, "approved");
      case "deny_request": return await actionRequest(base44, params, "denied");
      case "request_changes": return await actionRequest(base44, params, "changes_requested");
      case "cancel_request": return await cancelRequest(base44, params);
      case "get_team_time_off": return await getTeamTimeOff(base44, params);
      case "get_pto_impact": return await getPtoImpact(base44, params);
      case "get_ai_absence_recommendations": return await getAiAbsenceRecommendations(base44, params);
      case "get_return_summary": return await getReturnSummary(base44, params);
      default: return Response.json({ error: "Unknown action: " + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function getDefaultBalances() {
  return {
    pto: { balance_hours: 0, accrued_hours: 0, used_hours: 0, next_accrual_date: null, next_accrual_hours: 0 },
    sick: { balance_hours: 0, accrued_hours: 0, used_hours: 0 },
    personal: { balance_hours: 0, accrued_hours: 0, used_hours: 0 },
    other: [],
  };
}

async function getMember(base44, salesMemberId) {
  const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
  return members && members[0] ? members[0] : null;
}

function calcHours(start_date, end_date, is_partial_day, hours_requested) {
  if (hours_requested) return hours_requested;
  if (is_partial_day) return 4;
  const start = new Date(start_date + "T00:00:00Z");
  const end = new Date(end_date + "T00:00:00Z");
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(1, days) * 8;
}

// ─── Action: get_balances ──────────────────────────────────────────────────
async function getBalances(base44, { sales_member_id }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const config = getPayrollConfig();
  if (config.enabled && member.arriv_employee_id) {
    try {
      const result = await callPayrollApi(config, "get_balances", { employee_id: member.arriv_employee_id });
      return Response.json({ balances: result.balances || getDefaultBalances(), source: "arriv_payroll" });
    } catch (err) {
      return Response.json({ balances: getDefaultBalances(), source: "local", error: err.message });
    }
  }
  return Response.json({ balances: getDefaultBalances(), source: "local" });
}

// ─── Action: get_my_requests ──────────────────────────────────────────────
async function getMyRequests(base44, { sales_member_id }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const requests = await base44.asServiceRole.entities.TimeOffRequest.filter(
    { employee_id: sales_member_id }, "-created_at", 100
  );

  const today = new Date().toISOString().slice(0, 10);
  const active = (requests || []).filter((r) => r.status === "approved" && r.start_date <= today && r.end_date >= today);

  return Response.json({
    requests: requests || [],
    currently_on_leave: active.length > 0,
    current_leave: active[0] || null,
  });
}

// ─── Action: submit_request ────────────────────────────────────────────────
async function submitRequest(base44, params) {
  const { sales_member_id, leave_type, start_date, end_date, is_partial_day, hours_requested, employee_note } = params;
  if (!sales_member_id || !leave_type || !start_date || !end_date) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const config = getPayrollConfig();
  const hours = calcHours(start_date, end_date, is_partial_day, hours_requested);

  let currentBalance = 0;
  let payrollRequestId = "";
  let payrollSyncStatus = "not_synced";
  let payrollSyncError = "";

  if (config.enabled && member.arriv_employee_id) {
    try {
      const balResult = await callPayrollApi(config, "get_balances", { employee_id: member.arriv_employee_id });
      const balances = balResult.balances || getDefaultBalances();
      currentBalance = (balances[leave_type] || balances.pto || {}).balance_hours || 0;

      const result = await callPayrollApi(config, "submit_request", {
        employee_id: member.arriv_employee_id,
        leave_type, start_date, end_date,
        is_partial_day: !!is_partial_day,
        hours_requested: hours,
        employee_note: employee_note || "",
      });
      payrollRequestId = result?.request_id || "";
      payrollSyncStatus = "synced";
    } catch (err) {
      payrollSyncStatus = "error";
      payrollSyncError = err.message;
    }
  }

  const projectedRemaining = Math.max(0, currentBalance - hours);
  const request = await base44.asServiceRole.entities.TimeOffRequest.create({
    request_id: "tor_" + crypto.randomUUID(),
    employee_id: sales_member_id,
    employee_name: member.full_name,
    arriv_employee_id: member.arriv_employee_id || "",
    manager_id: member.manager_id || "",
    leave_type, start_date, end_date,
    is_partial_day: !!is_partial_day,
    hours_requested: hours,
    employee_note: employee_note || "",
    status: "pending",
    payroll_request_id: payrollRequestId,
    payroll_sync_status: payrollSyncStatus,
    payroll_sync_error: payrollSyncError,
    projected_remaining_balance: projectedRemaining,
    balance_at_submission: currentBalance,
    created_at: new Date().toISOString(),
  });

  return Response.json({ request });
}

// ─── Action: approve/deny/request_changes ──────────────────────────────────
async function actionRequest(base44, params, newStatus) {
  const { request_id, manager_sales_member_id, manager_note } = params;
  if (!request_id) return Response.json({ error: "request_id required" }, { status: 400 });
  const rows = await base44.asServiceRole.entities.TimeOffRequest.filter({ request_id });
  const request = rows && rows[0];
  if (!request) return Response.json({ error: "Request not found" }, { status: 404 });

  const manager = manager_sales_member_id ? await getMember(base44, manager_sales_member_id) : null;
  const config = getPayrollConfig();

  if (config.enabled && request.arriv_employee_id && request.payroll_request_id) {
    try {
      await callPayrollApi(config, newStatus + "_request", {
        request_id: request.payroll_request_id,
        employee_id: request.arriv_employee_id,
        manager_note: manager_note || "",
      });
    } catch (_) { /* Still update local record */ }
  }

  const updated = await base44.asServiceRole.entities.TimeOffRequest.update(request.id, {
    status: newStatus,
    manager_name_actioned: manager?.full_name || "",
    manager_note: manager_note || "",
    actioned_at: new Date().toISOString(),
  });

  return Response.json({ request: updated });
}

// ─── Action: cancel_request ────────────────────────────────────────────────
async function cancelRequest(base44, { request_id, sales_member_id }) {
  if (!request_id) return Response.json({ error: "request_id required" }, { status: 400 });
  const rows = await base44.asServiceRole.entities.TimeOffRequest.filter({ request_id });
  const request = rows && rows[0];
  if (!request) return Response.json({ error: "Request not found" }, { status: 404 });

  const config = getPayrollConfig();
  if (config.enabled && request.arriv_employee_id && request.payroll_request_id) {
    try {
      await callPayrollApi(config, "cancel_request", {
        request_id: request.payroll_request_id,
        employee_id: request.arriv_employee_id,
      });
    } catch (_) {}
  }

  const updated = await base44.asServiceRole.entities.TimeOffRequest.update(request.id, {
    status: "canceled",
    actioned_at: new Date().toISOString(),
  });
  return Response.json({ request: updated });
}

// ─── Action: get_team_time_off (manager view) ──────────────────────────────
async function getTeamTimeOff(base44, { sales_member_id }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const teamMembers = await base44.asServiceRole.entities.SalesTeamMember.filter(
    { is_active: true }, "full_name", 200
  );
  const requests = await base44.asServiceRole.entities.TimeOffRequest.filter({}, "-created_at", 500);

  const today = new Date().toISOString().slice(0, 10);
  const pending = (requests || []).filter((r) => r.status === "pending");
  const approved = (requests || []).filter((r) => r.status === "approved");
  const currentlyOff = approved.filter((r) => r.start_date <= today && r.end_date >= today);
  const upcoming = approved.filter((r) => r.start_date > today);

  const dateOffMap = {};
  for (const r of currentlyOff) {
    const key = r.start_date <= today && r.end_date >= today ? today : r.start_date;
    if (!dateOffMap[key]) dateOffMap[key] = [];
    dateOffMap[key].push(r.employee_name);
  }
  const coverageWarnings = Object.entries(dateOffMap)
    .filter(([, names]) => names.length >= 2)
    .map(([date, names]) => ({ date, count: names.length, names }));

  return Response.json({
    team_members: (teamMembers || []).map((m) => ({
      id: m.id, full_name: m.full_name, title: m.title, profile_picture_url: m.profile_picture_url,
    })),
    pending, approved, currently_off: currentlyOff, upcoming, coverage_warnings: coverageWarnings,
  });
}

// ─── Action: get_pto_impact (operational impact) ───────────────────────────
async function computePtoImpact(base44, salesMemberId, startDate, endDate) {
  const member = await getMember(base44, salesMemberId);
  if (!member) return null;
  const startIso = startDate + "T00:00:00.000Z";
  const endIso = endDate + "T23:59:59.999Z";

  const activities = await base44.asServiceRole.entities.ActivityLog.filter({
    sales_member_id: salesMemberId,
    activity_date: { $gte: startIso, $lte: endIso },
  }, "activity_date", 200);

  const followUps = (activities || []).filter((a) => a.activity_type === "task");
  const calls = (activities || []).filter((a) => a.activity_type === "call");
  const meetings = (activities || []).filter((a) => a.activity_type === "meeting");
  const emails = (activities || []).filter((a) => a.activity_type === "email");

  const openDeals = await base44.asServiceRole.entities.Deal.filter({
    sales_member_id: salesMemberId, status: "open",
  }, "-created_at", 50);

  const teamTimeOff = await base44.asServiceRole.entities.TimeOffRequest.filter({ status: "approved" });
  const othersOff = (teamTimeOff || []).filter((r) =>
    r.employee_id !== salesMemberId && r.start_date <= endDate && r.end_date >= startDate
  );

  return {
    follow_ups: followUps, calls, meetings, emails,
    open_deals: openDeals || [],
    others_off: othersOff.map((r) => ({ employee_name: r.employee_name, start_date: r.start_date, end_date: r.end_date, leave_type: r.leave_type })),
    summary: {
      follow_up_count: followUps.length, call_count: calls.length, meeting_count: meetings.length,
      email_count: emails.length, open_deal_count: (openDeals || []).length, others_off_count: othersOff.length,
    },
  };
}

async function getPtoImpact(base44, { sales_member_id, start_date, end_date }) {
  if (!sales_member_id || !start_date || !end_date) return Response.json({ error: "Missing params" }, { status: 400 });
  const data = await computePtoImpact(base44, sales_member_id, start_date, end_date);
  if (!data) return Response.json({ error: "Employee not found" }, { status: 404 });
  return Response.json(data);
}

// ─── Action: get_ai_absence_recommendations ────────────────────────────────
async function getAiAbsenceRecommendations(base44, { sales_member_id, start_date, end_date }) {
  if (!sales_member_id || !start_date || !end_date) return Response.json({ error: "Missing params" }, { status: 400 });
  const impact = await computePtoImpact(base44, sales_member_id, start_date, end_date);
  if (!impact) return Response.json({ error: "Employee not found" }, { status: 404 });

  const details = [
    ...impact.follow_ups.map((f) => `Follow-up: ${f.contact_name || "Unknown"} — ${f.notes || ""}`),
    ...impact.meetings.map((m) => `Meeting: ${m.contact_name || "Unknown"} — ${m.notes || ""}`),
    ...impact.open_deals.map((d) => `Open deal: ${d.contact_name || d.company || "Unknown"} — ${d.title || ""}`),
  ].slice(0, 30);

  const prompt = `An employee will be out from ${start_date} to ${end_date}. Operational impact:
- ${impact.summary.follow_up_count} follow-ups scheduled
- ${impact.summary.call_count} calls scheduled
- ${impact.summary.meeting_count} meetings scheduled
- ${impact.summary.email_count} emails queued
- ${impact.summary.open_deal_count} open opportunities requiring attention
- ${impact.summary.others_off_count} other team members also off during this period

Details:
${details.join("\n")}

Recommend actions to prepare for this absence. Categorize into:
1. "reschedule" — follow-ups or meetings to move to after the return
2. "delegate" — tasks that should be handed to a colleague
3. "coverage" — meetings that need someone to cover
4. "high_priority" — accounts/opportunities needing attention before or during the absence

Keep each recommendation concise (one sentence). Do NOT modify any assignments — only recommend.`;

  const res = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: "object",
      properties: {
        reschedule: { type: "array", items: { type: "string" } },
        delegate: { type: "array", items: { type: "string" } },
        coverage: { type: "array", items: { type: "string" } },
        high_priority: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
      },
    },
  });

  return Response.json({ recommendations: res, impact });
}

// ─── Action: get_return_summary (welcome back) ─────────────────────────────
async function getReturnSummary(base44, { sales_member_id }) {
  if (!sales_member_id) return Response.json({ error: "sales_member_id required" }, { status: 400 });
  const member = await getMember(base44, sales_member_id);
  if (!member) return Response.json({ error: "Employee not found" }, { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  const requests = await base44.asServiceRole.entities.TimeOffRequest.filter(
    { employee_id: sales_member_id, status: "approved" }, "-end_date", 10
  );

  const recentLeave = (requests || []).find((r) => r.end_date < today);
  if (!recentLeave) return Response.json({ has_return: false });

  const startIso = recentLeave.start_date + "T00:00:00.000Z";
  const endIso = recentLeave.end_date + "T23:59:59.999Z";
  const nowIso = new Date().toISOString();

  const activities = await base44.asServiceRole.entities.ActivityLog.filter({
    sales_member_id: sales_member_id,
    activity_date: { $gte: startIso, $lte: nowIso },
  }, "activity_date", 200);

  const whileOut = (activities || []).filter((a) => a.activity_date >= startIso && a.activity_date <= endIso);
  const sinceReturn = (activities || []).filter((a) => a.activity_date > endIso);

  const deals = await base44.asServiceRole.entities.Deal.filter({
    sales_member_id: sales_member_id,
  }, "-updated_date", 50);
  const dealsUpdated = (deals || []).filter((d) => d.updated_date >= startIso && d.updated_date <= endIso);

  const todayStart = today + "T00:00:00.000Z";
  const todayEnd = today + "T23:59:59.999Z";
  const dueToday = (activities || []).filter((a) => a.activity_type === "task" && a.activity_date >= todayStart && a.activity_date <= todayEnd);

  return Response.json({
    has_return: true,
    leave: recentLeave,
    summary: {
      contacts_responded: whileOut.filter((a) => a.activity_type === "email" || a.activity_type === "call").length,
      meetings_rescheduled: whileOut.filter((a) => a.activity_type === "meeting").length,
      opportunities_updated: dealsUpdated.length,
      followups_due_today: dueToday.length,
      new_activities: sinceReturn.length,
    },
  });
}