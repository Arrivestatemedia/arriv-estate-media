import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { token } = body;

    if (!token) return Response.json({ error: "token is required" }, { status: 400 });

    const invites = await base44.asServiceRole.entities.ClientSignupInvite.filter({ token });
    if (!invites || invites.length === 0) {
      return Response.json({ error: "Invite not found" }, { status: 404 });
    }
    const invite = invites[0];

    return Response.json({
      token: invite.token,
      sales_member_id: invite.sales_member_id,
      sales_member_name: invite.sales_member_name,
      client_name: invite.client_name || "",
      client_email: invite.client_email || "",
      client_phone: invite.client_phone || "",
      company: invite.company || "",
      package: invite.package,
      package_name: invite.package_name || "",
      locked_add_ons: invite.locked_add_ons || [],
      locked_total_price: invite.locked_total_price || 0,
      status: invite.status,
      notes: invite.notes || "",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});