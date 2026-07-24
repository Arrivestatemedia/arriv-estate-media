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

    // Derive the US state (2-letter abbreviation) from the coverage area so the
    // job board and new-job notifications can filter by state.
    const gmapsKey = Deno.env.get('VITE_GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (gmapsKey) {
      const extractState = (components) => {
        const c = (components || []).find((comp) => comp.types?.includes('administrative_area_level_1'));
        return c?.short_name ? String(c.short_name).toUpperCase() : null;
      };
      try {
        if (body.coverage_area && String(body.coverage_area).trim()) {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(String(body.coverage_area))}&key=${gmapsKey}`;
          const res = await fetch(url);
          const json = await res.json();
          if (json.status === 'OK' && json.results?.[0]) {
            const st = extractState(json.results[0].address_components);
            if (st) updateData.state = st;
            if (body.coverage_lat == null || body.coverage_lng == null) {
              const loc = json.results[0].geometry.location;
              updateData.coverage_lat = loc.lat;
              updateData.coverage_lng = loc.lng;
            }
          }
        } else if (body.coverage_lat != null && body.coverage_lng != null) {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${body.coverage_lat},${body.coverage_lng}&key=${gmapsKey}`;
          const res = await fetch(url);
          const json = await res.json();
          if (json.status === 'OK' && json.results?.[0]) {
            const st = extractState(json.results[0].address_components);
            if (st) updateData.state = st;
          }
        }
      } catch (e) {
        console.error('Coverage geocode failed:', e.message);
      }
      // Clearing coverage → clear state too.
      if (body.coverage_area === '' && body.max_travel_distance == null) {
        updateData.state = null;
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