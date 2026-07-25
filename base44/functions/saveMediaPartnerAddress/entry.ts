import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const email = body.email;
    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const { mailing_address, city, state, zip } = body;
    if (!mailing_address || !city || !state || !zip) {
      return Response.json({ error: 'mailing_address, city, state, and zip are required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Case-insensitive email match — stored records may use mixed case.
    const normalized = String(email).toLowerCase();
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const emailQuery = { $regex: `^${escaped}$`, $options: 'i' };

    const updateData = {
      mailing_address: String(mailing_address).trim(),
      city: String(city).trim(),
      state: String(state).trim().toUpperCase(),
      zip: String(zip).trim(),
    };

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
    console.error('saveMediaPartnerAddress error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});