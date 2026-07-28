export async function getPayrollSetting(base44, key) {
  const rows = await base44.asServiceRole.entities.AppSetting.filter({ key });
  return rows && rows.length ? rows[0] : null;
}

export async function getPayrollSettingValue(base44, key, fallback = "") {
  const row = await getPayrollSetting(base44, key);
  return row && row.value ? row.value : fallback;
}

export async function setPayrollSetting(base44, key, value) {
  const existing = await getPayrollSetting(base44, key);
  if (existing) {
    return await base44.asServiceRole.entities.AppSetting.update(existing.id, { value: String(value) });
  }
  return await base44.asServiceRole.entities.AppSetting.create({ key, value: String(value) });
}

export async function getPayrollConfig(base44) {
  const endpoint =
    (await getPayrollSettingValue(base44, "payroll_endpoint", "")) ||
    Deno.env.get("ARRIV_PAYROLL_API_ENDPOINT") ||
    "";
  const company_id =
    (await getPayrollSettingValue(base44, "payroll_company_id", "")) ||
    Deno.env.get("ARRIV_PAYROLL_COMPANY_ID") ||
    "";
  const enabled = (await getPayrollSettingValue(base44, "payroll_enabled", "false")) === "true";
  const apiSecret = Deno.env.get("ARRIV_PAYROLL_API_SECRET") || "";
  const webhookSecret = Deno.env.get("ARRIV_PAYROLL_WEBHOOK_SECRET") || "";
  return { endpoint, company_id, enabled, apiSecret, webhookSecret };
}