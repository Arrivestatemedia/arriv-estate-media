import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const url = (body?.url || "").trim();
    if (!url) return Response.json({ error: "url is required" }, { status: 400 });

    const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: "sales_welcome_video_url" });
    if (existing && existing[0]) {
      await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value: url });
    } else {
      await base44.asServiceRole.entities.AppSetting.create({ key: "sales_welcome_video_url", value: url });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});