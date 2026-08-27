import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { roomName, conferenceId } = await req.json();

    // Admin-only: verify the caller is an admin
    let user;
    try {
      user = await base44.auth.me();
    } catch (_) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find the Conference by room_name or id
    let conference;
    if (conferenceId) {
      conference = await base44.asServiceRole.entities.Conference.get(conferenceId);
    } else if (roomName) {
      const conferences = await base44.asServiceRole.entities.Conference.filter({ room_name: roomName });
      conference = conferences?.[0];
    }
    if (!conference) {
      return Response.json({ error: 'Conference not found' }, { status: 404 });
    }

    // Only convert scheduled interviews (don't convert completed ones)
    if (conference.status === 'completed' || conference.status === 'cancelled') {
      return Response.json({ error: 'Cannot convert a completed or cancelled interview' }, { status: 400 });
    }

    // Set interview_mode to "ai" — do NOT change meeting_link or room_name
    await base44.asServiceRole.entities.Conference.update(conference.id, {
      interview_mode: 'ai',
    });

    // No Tavus API call needed yet — the conversation is created when the applicant opens the link

    return Response.json({
      status: 'success',
      conference_id: conference.id,
      interview_mode: 'ai',
      meeting_link: conference.meeting_link, // unchanged
      room_name: conference.room_name, // unchanged
    });
  } catch (error) {
    console.error('convertConferenceToAi error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});