import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { gearBagImageUrl, waterBottleImageUrl } = await req.json();

    // Update default gear image URLs (these will be shown to all new media partners)
    // In production, these should be stored in a global settings table
    // For now, we'll return success and these URLs should be manually set

    return Response.json({
      success: true,
      message: 'Gear images ready to be set',
      gearBagImageUrl: gearBagImageUrl || 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/87121d65d_GearBagImage.png',
      waterBottleImageUrl: waterBottleImageUrl || 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/8ca33b43d_WaterBottleImage.png'
    });

  } catch (error) {
    console.error('Error uploading gear images:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});