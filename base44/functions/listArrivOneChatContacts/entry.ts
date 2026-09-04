import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { getEmailDomain } from "../../shared/crossAppChat.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Determine the current user's email — check both Base44 auth and sales session
    let currentUserEmail = user.email;
    if (!currentUserEmail) {
      const salesEmail = base44.asServiceRole
        ? null
        : null; // fallback handled below
    }

    // Sales session fallback (custom auth): look up the sales member by ID
    if (!currentUserEmail) {
      const salesMemberId =
        (typeof localStorage !== "undefined" && localStorage.getItem("sales_member_id")) ||
        "";
      if (salesMemberId) {
        const members = await base44.entities.SalesTeamMember.filter({ id: salesMemberId });
        if (members?.[0]?.email) currentUserEmail = members[0].email;
      }
    }

    if (!currentUserEmail) {
      return Response.json({ error: "Could not determine your email" }, { status: 400 });
    }

    const myDomain = getEmailDomain(currentUserEmail);
    if (!myDomain) {
      return Response.json({ contacts: [] });
    }

    // Query the Person entity for people who exist in Arriv One (have arriv_employee_id)
    // and share the same email domain (same company).
    const persons = await base44.asServiceRole.entities.Person.filter({
      status: "active",
    });

    const contacts = (persons || [])
      .filter((p) => {
        if (!p.email || !p.arriv_employee_id) return false;
        return getEmailDomain(p.email) === myDomain;
      })
      .map((p) => ({
        email: p.email,
        full_name: p.full_name,
        arriv_employee_id: p.arriv_employee_id,
      }))
      // Exclude self
      .filter((c) => c.email.toLowerCase() !== currentUserEmail.toLowerCase())
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

    return Response.json({ contacts });
  } catch (error) {
    console.error("listArrivOneChatContacts error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}