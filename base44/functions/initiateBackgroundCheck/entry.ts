import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const CHECKR_BASE = 'https://api.checkr.com/v1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { jobId, jobData, mediaPartnerEmail, bookJob = true } = body;

    if (!mediaPartnerEmail) {
      return Response.json({ error: 'mediaPartnerEmail is required' }, { status: 400 });
    }

    const apiKey = Deno.env.get('CHECKR_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'Background check not configured (missing Checkr API key). Please add CHECKR_API_KEY in Settings.' }, { status: 500 });
    }

    const checkrAuth = 'Basic ' + btoa(apiKey + ':');

    // Already cleared — just book if requested (shouldn't normally hit here, gate handles it).
    if (user.background_check_status === 'clear') {
      if (bookJob && jobId && jobData) {
        await base44.asServiceRole.functions.invoke('bookJobAndSendCalendarInvite', { jobId, jobData, mediaPartnerEmail });
      }
      return Response.json({ success: true, alreadyCleared: true });
    }

    // Already authorized and pending — reuse the existing invitation, don't recreate.
    if (user.checkr_invitation_url && user.background_check_status === 'pending') {
      return Response.json({ success: true, invitation_url: user.checkr_invitation_url, reused: true });
    }

    // Build candidate from the logged-in user's profile.
    const fullName = (user.full_name || '').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || 'Media';
    const lastName = nameParts.slice(1).join(' ') || 'Partner';

    const candRes = await fetch(CHECKR_BASE + '/candidates', {
      method: 'POST',
      headers: { 'Authorization': checkrAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email: user.email, copy_requested: true }),
    });
    if (!candRes.ok) {
      const errText = await candRes.text();
      console.error('Checkr candidate creation failed:', candRes.status, errText);
      return Response.json({ error: 'We could not start your background check with our screening partner. Please try again or contact support.' }, { status: 502 });
    }
    const candidate = await candRes.json();

    const pkg = Deno.env.get('CHECKR_PACKAGE') || 'tasker_standard';
    const invRes = await fetch(CHECKR_BASE + '/invitations', {
      method: 'POST',
      headers: { 'Authorization': checkrAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidate.id, package: pkg }),
    });
    if (!invRes.ok) {
      const errText = await invRes.text();
      console.error('Checkr invitation creation failed:', invRes.status, errText);
      return Response.json({ error: 'We could not start your background check with our screening partner. Please try again or contact support.' }, { status: 502 });
    }
    const invitation = await invRes.json();

    // Persist the Checkr references + pending status on the partner record.
    await base44.asServiceRole.entities.User.update(user.id, {
      checkr_candidate_id: candidate.id,
      checkr_invitation_id: invitation.id,
      checkr_invitation_url: invitation.invitation_url,
      background_check_status: 'pending',
      background_check_authorized_at: new Date().toISOString(),
      background_check_pending_job_id: jobId || null,
    });

    // Book the gig now (the partner is confirmed once they've authorized and entered the Checkr flow).
    if (bookJob && jobId && jobData) {
      await base44.asServiceRole.functions.invoke('bookJobAndSendCalendarInvite', { jobId, jobData, mediaPartnerEmail });
    }

    return Response.json({ success: true, invitation_url: invitation.invitation_url });
  } catch (error) {
    console.error('initiateBackgroundCheck error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});