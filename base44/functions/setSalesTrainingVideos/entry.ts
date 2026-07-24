import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin auth: Base44 admin OR sales admin via sales_member_id
    let isAdmin = false;
    let body = null;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch (e) {
      body = await req.clone().json();
      if (body.sales_member_id) {
        const m = await base44.asServiceRole.entities.SalesTeamMember.get(body.sales_member_id);
        isAdmin = m?.role === 'admin';
      }
    }
    if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });

    if (!body) body = await req.json();
    const { videos } = body;
    if (!Array.isArray(videos)) return Response.json({ error: 'videos must be an array' }, { status: 400 });

    const clean = videos
      .map((v) => ({ title: String(v?.title || "").slice(0, 200), url: String(v?.url || "").trim().slice(0, 500) }))
      .filter((v) => v.url);

    const value = JSON.stringify(clean);
    const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: "sales_training_videos" });
    if (existing?.[0]) {
      await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value });
    } else {
      await base44.asServiceRole.entities.AppSetting.create({ key: "sales_training_videos", value });
    }

    return Response.json({ success: true, videos: clean });
  } catch (error) {
    console.error('setSalesTrainingVideos error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});