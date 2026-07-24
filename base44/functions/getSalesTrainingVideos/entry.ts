import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let videos = [];
    try {
      const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: "sales_training_videos" });
      if (settings?.[0]?.value) {
        videos = JSON.parse(settings[0].value);
      }
    } catch (e) {
      // no settings yet — return empty
    }
    return Response.json({ success: true, videos: Array.isArray(videos) ? videos : [] });
  } catch (error) {
    return Response.json({ success: true, videos: [] });
  }
});