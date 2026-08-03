// generateKhethaIQSSOToken/entry.ts
// Generates a signed SSO token for the current authenticated admin user to
// embed the main KhethaIQ application. Also returns the embed configuration
// (enabled flag + app URL) so the frontend can decide whether to show the
// embed or the local KhethaIQ implementation (feature flag for parallel
// validation during migration).
//
// Returns:
//   { embed_enabled: false }  — when the feature flag is off (local experience)
//   { embed_enabled: true, app_url, sso_token, user_context }  — when enabled

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { generateSSOToken, buildEmbedContext } from "../../shared/khethaIQEmbed.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Resolve the calling user — support both Base44 auth (platform admin)
    // and sales team sessions (sales admin) via sales_member_id in the body.
    let ssoUser = null;
    if (body.sales_member_id) {
      try {
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: body.sales_member_id });
        const m = Array.isArray(members) && members[0];
        if (m && m.role === "admin") {
          ssoUser = {
            id: m.id,
            email: m.email,
            full_name: m.full_name,
            role: "admin",
          };
        }
      } catch (_) {}
    }

    if (!ssoUser) {
      const u = await base44.auth.me();
      if (u && u.role === "admin") {
        ssoUser = { id: u.id, email: u.email, full_name: u.full_name, role: u.role };
      }
    }

    if (!ssoUser) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (ssoUser.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check feature flag (AppSetting: khethaiq_embed_enabled = "true")
    let embedEnabled = false;
    try {
      const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: "khethaiq_embed_enabled" });
      embedEnabled = Array.isArray(settings) && settings.length > 0 && settings[0].value === "true";
    } catch (_) {}

    const appUrl = secrets.get("KHETHAIQ_APP_URL");
    if (embedEnabled && !appUrl) {
      console.warn("KHETHAIQ_APP_URL not set but embed is enabled — falling back to local");
      embedEnabled = false;
    }

    if (!embedEnabled) {
      return Response.json({ embed_enabled: false });
    }

    const ssoToken = await generateSSOToken({
      user_id: ssoUser.id,
      email: ssoUser.email,
      full_name: ssoUser.full_name,
      role: ssoUser.role,
    });

    const userContext = buildEmbedContext(ssoUser);

    return Response.json({
      embed_enabled: true,
      app_url: appUrl,
      sso_token: ssoToken,
      user_context: userContext,
    });
  } catch (error) {
    console.error("generateKhethaIQSSOToken error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}