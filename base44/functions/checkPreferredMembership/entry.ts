import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { requireCustomer } from "../../shared/customerSession.ts";

// Check if the signed-in customer has an active Preferred membership.
// The account id and email come from the verified session, so one customer can never read
// another customer's membership by supplying an id or address.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) {
      return Response.json({ error: auth.error }, { status: auth.status });
    }
    const client_id = auth.record.id;
    const client_email = auth.actor.email;

    let memberships = await base44.asServiceRole.entities.PreferredMembership.filter({
      client_id,
    });
    if (!memberships || memberships.length === 0) {
      memberships = await base44.asServiceRole.entities.PreferredMembership.filter({
        client_email,
      });
    }

    const activeMembership = (memberships || []).find((m) => m.status === "active");

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