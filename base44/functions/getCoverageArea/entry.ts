import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    let email = null;
    try {
      const body = await req.json();
      email = body?.email ?? null;
    } catch (_e) {
      // GET request or empty body — fall back to query param.
    }
    if (!email) {
      const url = new URL(req.url);
      email = url.searchParams.get('email');
    }
    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Case-insensitive email match — stored records may use mixed case.
    const normalized = String(email).toLowerCase();
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const emailQuery = { $regex: `^${escaped}$`, $options: 'i' };

    const empty = { coverage_area: null, coverage_lat: null, coverage_lng: null, max_travel_distance: null, state: null };

    // Find the partner's record (PendingSignup first, then User).
    let record = null;
    let recordKind = null;
    const pending = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailQuery });
    if (pending.length > 0) {
      record = pending[0];
      recordKind = 'PendingSignup';
    } else {
      try {
        const users = await base44.asServiceRole.entities.User.filter({ email: emailQuery });
        if (users.length > 0) {
          record = users[0];
          recordKind = 'User';
        }
      } catch (_e) {
        // Non-admin callers can't list users — fall through to empty.
      }
    }

    if (!record) return Response.json(empty);

    const response = {
      coverage_area: record.coverage_area || null,
      coverage_lat: record.coverage_lat ?? null,
      coverage_lng: record.coverage_lng ?? null,
      max_travel_distance: record.max_travel_distance ?? null,
      state: record.state || null
    };

    // Derive the partner's state from the address on their job application if the
    // record doesn't already have one — so even partners who never set a coverage
    // area are filtered to jobs in their state. Persist it so the new-job message
    // (which reads User.state) and future board loads have it.
    if (!response.state) {
      let derived = null;
      try {
        const apps = await base44.asServiceRole.entities.JobApplication.filter({ email: emailQuery });
        const app = apps[0];
        if (app?.address) {
          const gmapsKey = Deno.env.get('VITE_GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY');
          if (gmapsKey) {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(app.address)}&key=${gmapsKey}`;
            const res = await fetch(url);
            const json = await res.json();
            if (json.status === 'OK' && json.results?.[0]) {
              const c = (json.results[0].address_components || []).find((comp) => comp.types?.includes('administrative_area_level_1'));
              if (c?.short_name) derived = String(c.short_name).toUpperCase();
            }
          }
        }
      } catch (e) {
        console.error('Derive state from application failed:', e.message);
      }

      if (derived) {
        response.state = derived;
        try {
          if (recordKind === 'PendingSignup') {
            await base44.asServiceRole.entities.PendingSignup.update(record.id, { state: derived });
            try {
              const users = await base44.asServiceRole.entities.User.filter({ email: emailQuery });
              if (users.length > 0) await base44.asServiceRole.entities.User.update(users[0].id, { state: derived });
            } catch (_e) {}
          } else {
            await base44.asServiceRole.entities.User.update(record.id, { state: derived });
            try {
              const ps = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailQuery });
              if (ps.length > 0) await base44.asServiceRole.entities.PendingSignup.update(ps[0].id, { state: derived });
            } catch (_e) {}
          }
        } catch (e) {
          console.error('Persist state failed:', e.message);
        }
      }
    }

    return Response.json(response);
  } catch (error) {
    console.error('getCoverageArea error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});