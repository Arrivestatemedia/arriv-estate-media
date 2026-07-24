import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: "sales_welcome_video_url" });
    const url = settings && settings[0] ? settings[0].value || "" : "";
    return Response.json({ url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});