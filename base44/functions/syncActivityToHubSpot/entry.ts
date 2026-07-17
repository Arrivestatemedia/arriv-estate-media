import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { activityId } = await req.json();
    if (!activityId) {
      return Response.json({ error: 'activityId required' }, { status: 400 });
    }

    // Fetch activity
    const activities = await base44.asServiceRole.entities.ActivityLog.filter({ id: activityId });
    const activity = activities[0];
    if (!activity) {
      return Response.json({ error: 'Activity not found' }, { status: 404 });
    }

    // No longer syncing to HubSpot — the ActivityLog entity IS the system of record.
    // This function is kept for backward compatibility but is a no-op.
    return Response.json({ 
      success: true, 
      message: 'Activities are now stored locally — no HubSpot sync needed.'
    });

  } catch (error) {
    console.error('Sync activity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});