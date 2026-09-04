import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { getEmailDomain } from "../../shared/crossAppChat.ts";

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
      .filter((c) => c.email.toLowerCase() !== currentUserEmail.toLowerCase())
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

    return Response.json({ contacts });
  } catch (error) {
    console.error("listArrivOneChatContacts error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}