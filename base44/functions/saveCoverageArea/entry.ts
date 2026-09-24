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

    // When the coverage area (zip) changes, derive the US state from it so the
    // Job Board's state filter matches jobs in the partner's NEW coverage state.
    // Without this, a partner who moves their coverage zip to a new state still
    // has their old state on record, so jobs in the new state stay hidden.
    if (body.coverage_area !== undefined) {
      try {
        const gmapsKey = Deno.env.get('VITE_GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY');
        if (gmapsKey) {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(String(body.coverage_area))}&key=${gmapsKey}`;
          const res = await fetch(url);
          const json = await res.json();
          if (json.status === 'OK' && json.results?.[0]) {
            const c = (json.results[0].address_components || []).find((comp) => comp.types?.includes('administrative_area_level_1'));
            if (c?.short_name) {
              updateData.state = String(c.short_name).toUpperCase();
            }
          }
        }
      } catch (e) {
        console.error('Derive state from coverage_area failed:', e.message);
      }
    }

    // Case-insensitive email match — stored records may use mixed case.
    const normalized = String(email).toLowerCase();
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const emailQuery = { $regex: `^${escaped}$`, $options: 'i' };

    // Sync to BOTH the PendingSignup and User records (whichever exist) so the
    // live user object (used by the job board + job notifications) stays current.
    let updated = false;
    const pendingSignups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailQuery });
    if (pendingSignups.length > 0) {
      await base44.asServiceRole.entities.PendingSignup.update(pendingSignups[0].id, updateData);
      updated = true;
    }

    try {
      const users = await base44.asServiceRole.entities.User.filter({ email: emailQuery });
      if (users.length > 0) {
        await base44.asServiceRole.entities.User.update(users[0].id, updateData);
        updated = true;
      }
    } catch (_e) {
      // Non-admin callers can't list users — fall through.
    }

    if (!updated) {
      return Response.json({ error: 'Partner record not found' }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (error) {
    console.error('saveCoverageArea error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});