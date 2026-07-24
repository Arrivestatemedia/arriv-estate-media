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

    const pending = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailQuery });
    if (pending.length > 0) {
      const r = pending[0];
      return Response.json({
        coverage_area: r.coverage_area || null,
        coverage_lat: r.coverage_lat ?? null,
        coverage_lng: r.coverage_lng ?? null,
        max_travel_distance: r.max_travel_distance ?? null,
        state: r.state || null
      });
    }

    try {
      const users = await base44.asServiceRole.entities.User.filter({ email: emailQuery });
      if (users.length > 0) {
        const r = users[0];
        return Response.json({
          coverage_area: r.coverage_area || null,
          coverage_lat: r.coverage_lat ?? null,
          coverage_lng: r.coverage_lng ?? null,
          max_travel_distance: r.max_travel_distance ?? null
        });
      }
    } catch (_e) {
      // Non-admin callers can't list users — fall through to empty.
    }

    return Response.json(empty);
  } catch (error) {
    console.error('getCoverageArea error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});