import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendNewPartnerJobDigest } from '../../shared/newPartnerJobDigest.ts';
import { geocodeZipKeyless } from '../../shared/jobNotifications.ts';

/**
 * saveCoverageArea
 *
 * Every media partner records a state, a ZIP code and a travel range. The ZIP is
 * the center of their work area and the range is how far they'll drive, so job
 * scoping runs from that ZIP outward. Nothing is saved without all three.
 */
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const email = body.email;
    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    const rawZip = String(body.zip ?? body.coverage_area ?? '').trim();
    if (!/^\d{5}$/.test(rawZip)) {
      return Response.json({ error: 'A 5-digit ZIP code is required' }, { status: 400 });
    }

    const state = String(body.state ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) {
      return Response.json({ error: 'A valid 2-letter state is required' }, { status: 400 });
    }

    const distance = Number(body.max_travel_distance);
    if (!distance || distance <= 0) {
      return Response.json({ error: 'A travel range greater than zero is required' }, { status: 400 });
    }

    // Geocode the ZIP server-side so the radius check has a center immediately.
    let lat = null;
    let lng = null;
    try {
      const gmapsKey = Deno.env.get('VITE_GOOGLE_MAPS_API_KEY');
      if (gmapsKey) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(rawZip)}&key=${gmapsKey}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.status === 'OK' && json.results?.[0]) {
          const loc = json.results[0].geometry.location;
          lat = loc.lat;
          lng = loc.lng;
        }
      }
    } catch (e) {
      console.error('Geocode ZIP failed:', e.message);
    }

    // Google's Geocoding API is denied for the browser-restricted key, so fall
    // back to a keyless ZIP lookup before giving up on the center point.
    if (lat == null || lng == null) {
      const fallback = await geocodeZipKeyless(rawZip);
      if (fallback) {
        lat = fallback.lat;
        lng = fallback.lng;
      }
    }

    if (lat == null || lng == null) {
      return Response.json(
        { error: "We couldn't locate that ZIP code. Please check it and try again." },
        { status: 400 }
      );
    }

    const updateData = {
      zip: rawZip,
      state,
      max_travel_distance: distance,
      coverage_area: rawZip,
      coverage_lat: lat,
      coverage_lng: lng,
    };

    // Case-insensitive email match — stored records may use mixed case.
    const normalized = String(email).toLowerCase();
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const emailQuery = { $regex: `^${escaped}$`, $options: 'i' };

    // Sync to BOTH the PendingSignup and User records (whichever exist) so the
    // live user object (used by the job board + job notifications) stays current.
    let updated = false;
    let partnerRecord = null;
    const pendingSignups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailQuery });
    if (pendingSignups.length > 0) {
      await base44.asServiceRole.entities.PendingSignup.update(pendingSignups[0].id, updateData);
      partnerRecord = pendingSignups[0];
      updated = true;
    }

    try {
      const users = await base44.asServiceRole.entities.User.filter({ email: emailQuery });
      if (users.length > 0) {
        await base44.asServiceRole.entities.User.update(users[0].id, updateData);
        partnerRecord = partnerRecord || users[0];
        updated = true;
      }
    } catch (_e) {
      // Non-admin callers can't list users — fall through.
    }

    if (!updated) {
      return Response.json({ error: 'Partner record not found' }, { status: 404 });
    }

    // A partner's work area is the first point where we know where they'll drive,
    // so this is when they learn about the gigs already open to them.
    let digest = null;
    try {
      digest = await sendNewPartnerJobDigest(base44, {
        ...(partnerRecord || {}),
        email,
        ...updateData,
      });
    } catch (e) {
      console.error('New partner job digest failed:', e.message);
    }

    return Response.json({
      success: true,
      zip: rawZip,
      state,
      max_travel_distance: distance,
      jobs_announced: digest?.jobs_announced || 0,
    });
  } catch (error) {
    console.error('saveCoverageArea error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});