import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

// Check if a customer has an active Preferred membership.
// Looks up by client_id or client_email.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { client_id, client_email } = body;

    if (!client_id && !client_email) {
      return Response.json({ error: "client_id or client_email is required" }, { status: 400 });
    }

    let memberships = [];
    if (client_id) {
      memberships = await base44.asServiceRole.entities.PreferredMembership.filter({
        client_id,
      });
    }
    if ((!memberships || memberships.length === 0) && client_email) {
      memberships = await base44.asServiceRole.entities.PreferredMembership.filter({
        client_email,
      });
    }

    const activeMembership = (memberships || []).find(m => m.status === "active");

    return Response.json({
      success: true,
      is_preferred: !!activeMembership,
      membership: activeMembership || null,
      all_memberships: memberships || [],
    });
  } catch (error) {
    console.error("checkPreferredMembership error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}