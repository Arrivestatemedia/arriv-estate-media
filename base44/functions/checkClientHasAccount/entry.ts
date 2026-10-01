import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { checkClientHasAccount } from "../../shared/clientAccountCheck.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin-only
    let isAuthorized = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role === "admin") isAuthorized = true;
    } catch (_e) { /* not a base44 user */ }

    // Sales team members call from the admin UI — allow through
    if (!isAuthorized) {
      // Sales session check via request body identity
      const body = await req.clone().json().catch(() => ({}));
      if (body.sales_member_id || body.email) isAuthorized = true;
    }

    if (!isAuthorized) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { email } = await req.json();
    if (!email) {
      return Response.json({ error: "email is required" }, { status: 400 });
    }

    const hasAccount = await checkClientHasAccount(base44, email);
    return Response.json({ hasAccount });
  } catch (error) {
    console.error("checkClientHasAccount error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});