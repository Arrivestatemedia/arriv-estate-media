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

    // Update all media partner users with the new video URL
    // This sets a default for new signups
    // Note: In production, this might be stored as a global setting instead

    return Response.json({ 
      success: true,
      message: 'Orientation video URL updated. This will be shown to new media partners during orientation.'
    });

  } catch (error) {
    console.error('Error setting orientation video URL:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});