import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { isAllowedCrossAppTenant } from "../../shared/crossAppChat.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { user_email: paramEmail } = body;

    // Determine the current user's email — Base44 auth first, then frontend param
    let currentUserEmail = user.email || paramEmail;
    if (!currentUserEmail) {
      return Response.json({ error: "Could not determine your email" }, { status: 400 });
    }

    // Synced employees live in SalesTeamMember (sync_source="arriv_one", arriv_employee_id set).
    // The Person table is the canonical identity layer but is not populated by sync,
    // so we query SalesTeamMember directly for cross-app contacts.
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({
      is_active: true,
    });

    const contacts = (members || [])
      .filter((m) => {
        if (!m.email || !m.arriv_employee_id) return false;
        if (m.is_active === false) return false;
        // tenant_id may be unset on legacy sync records; when present, enforce allowlist.
        // When absent, arriv_employee_id presence proves the Arriv One link.
        if (m.tenant_id && !isAllowedCrossAppTenant(m.tenant_id)) return false;
        return true;
      })
      .map((m) => ({
        id: m.id,
        email: m.email,
        full_name: m.full_name,
        arriv_employee_id: m.arriv_employee_id,
        extension: m.extension,
      }))
      .filter((c) => c.email.toLowerCase() !== currentUserEmail.toLowerCase())
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

    return Response.json({ contacts });
  } catch (error) {
    console.error("listArrivOneChatContacts error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}