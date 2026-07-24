import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const email = body.email;
    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Build the update payload from only the fields that were provided so we
    // can do partial updates (e.g. background geocode of lat/lng only).
    const updateData = {};
    if (body.coverage_area !== undefined) updateData.coverage_area = body.coverage_area;
    if (body.coverage_lat !== undefined) updateData.coverage_lat = body.coverage_lat;
    if (body.coverage_lng !== undefined) updateData.coverage_lng = body.coverage_lng;
    if (body.max_travel_distance !== undefined) updateData.max_travel_distance = body.max_travel_distance;

    // Case-insensitive email match — stored records may use mixed case.
    const normalized = String(email).toLowerCase();
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const emailQuery = { $regex: `^${escaped}$`, $options: 'i' };

    const pendingSignups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailQuery });
    if (pendingSignups.length > 0) {
      await base44.asServiceRole.entities.PendingSignup.update(pendingSignups[0].id, updateData);
      return Response.json({ success: true });
    }

    try {
      const users = await base44.asServiceRole.entities.User.filter({ email: emailQuery });
      if (users.length > 0) {
        await base44.asServiceRole.entities.User.update(users[0].id, updateData);
        return Response.json({ success: true });
      }
    } catch (_e) {
      // Non-admin callers can't list users — fall through to not found.
    }

    return Response.json({ error: 'Partner record not found' }, { status: 404 });
  } catch (error) {
    console.error('saveCoverageArea error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});