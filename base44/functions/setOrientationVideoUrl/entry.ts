import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { videoUrl } = await req.json();

    if (!videoUrl) {
      return Response.json({ error: 'Video URL is required' }, { status: 400 });
    }

    // Upsert the global orientation video URL shown to all media partners
    const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: 'orientation_video_url' });
    if (existing && existing.length > 0) {
      await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value: videoUrl });
    } else {
      await base44.asServiceRole.entities.AppSetting.create({ key: 'orientation_video_url', value: videoUrl });
    }

    return Response.json({
      success: true,
      message: 'Orientation video URL updated. This will be shown to all media partners during orientation.'
    });

  } catch (error) {
    console.error('Error setting orientation video URL:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});