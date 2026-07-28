import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  getPayrollConfig,
  setPayrollSetting,
  getPayrollSettingValue,
} from "../../shared/payrollSettings.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || "get";

    if (action === "list_employees") {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });
      const employees = (members || []).map((m) => ({
        id: m.id,
        full_name: m.full_name,
        email: m.email,
        title: m.title,
        payroll_employee_id: m.payroll_employee_id || "",
        payroll_sync_status: m.payroll_sync_status || "not_synced",
        payroll_last_synced_at: m.payroll_last_synced_at || "",
        payroll_sync_error: m.payroll_sync_error || "",
      }));
      return Response.json({ employees });
    }

    if (action === "save") {
      const { endpoint, company_id, enabled } = body;
      if (typeof endpoint !== "undefined" && endpoint !== null) {
        await setPayrollSetting(base44, "payroll_endpoint", String(endpoint).trim());
      }
      if (typeof company_id !== "undefined" && company_id !== null) {
        await setPayrollSetting(base44, "payroll_company_id", String(company_id).trim());
      }
      if (typeof enabled === "boolean") {
        await setPayrollSetting(base44, "payroll_enabled", enabled ? "true" : "false");
      }
    }

    // action 'get' (or fallthrough after save) — return current configuration
    const config = await getPayrollConfig(base44);
    const last_sync_at = await getPayrollSettingValue(base44, "payroll_last_sync_at", "");
    const last_sync_error = await getPayrollSettingValue(base44, "payroll_last_sync_error", "");

    return Response.json({
      endpoint: config.endpoint,
      company_id: config.company_id,
      enabled: config.enabled,
      has_api_secret: !!config.apiSecret,
      has_webhook_secret: !!config.webhookSecret,
      last_sync_at: last_sync_at,
      last_sync_error: last_sync_error,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});