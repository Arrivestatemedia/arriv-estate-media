import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { buildSignedHeaders } from "../../shared/payrollSigning.ts";

// ─── Main handler ─────────────────────────────────────────────────────────
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json();
    const {
      company_name = "Arriv Estate Media",
      plan = "starter",
      status = "active",
      seat_count = 10,
      admin_name,
      admin_email,
      billing_contact_email,
    } = body;

    const endpoint = secrets.get("ARRIV_PAYROLL_ENDPOINT") || "";
    const webhookSecret = secrets.get("ARRIV_PAYROLL_WEBHOOK_SECRET") || "";

    if (!endpoint) return Response.json({ error: "ARRIV_PAYROLL_ENDPOINT not set" }, { status: 500 });
    if (!webhookSecret) return Response.json({ error: "ARRIV_PAYROLL_WEBHOOK_SECRET not set" }, { status: 500 });

    const payload = {
      source_application_id: "arriv-estate-media",
      company_name,
      plan,
      status,
      seat_count,
      admin: {
        name: admin_name || user.full_name || "Brad Burke",
        email: admin_email || user.email || "brad@arriv.com",
        role: "admin",
      },
      billing_contact_email: billing_contact_email || admin_email || user.email || "brad@arriv.com",
      created_at: new Date().toISOString(),
    };

    const bodyStr = JSON.stringify(payload);
    const sourceAppId = "arriv-estate-media";
    const headers = await buildSignedHeaders(webhookSecret, bodyStr, sourceAppId);

    const base = endpoint.replace(/\/functions\/.*$/i, "").replace(/\/$/, "");
    const url = base + "/functions/provisionCompany";

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: bodyStr,
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return Response.json({ error: data.error || `Provisioning failed: ${resp.status}`, raw: data }, { status: resp.status });
    }

    return Response.json({
      success: true,
      company_id: data.company_id || "",
      message: data.company_id
        ? "Company provisioned. Save this company_id as the ARRIV_PAYROLL_COMPANY_ID secret."
        : "Provisioning call succeeded but no company_id was returned.",
      raw: data,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}