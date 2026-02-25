import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { eventId, updates, rsvpStatus, userEmail } = await req.json();

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');

    // If RSVP only (accept/decline), patch attendee status
    if (rsvpStatus) {
      const getRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!getRes.ok) {
        const err = await getRes.json();
        return Response.json({ error: 'Failed to fetch event', details: err }, { status: 500 });
      }
      const event = await getRes.json();

      // Update attendee RSVP
      const attendees = (event.attendees || []).map(a => {
        if (a.email?.toLowerCase() === userEmail?.toLowerCase()) {
          return { ...a, responseStatus: rsvpStatus }; // 'accepted' | 'declined' | 'tentative'
        }
        return a;
      });

      const patchRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ attendees })
      });

      if (!patchRes.ok) {
        const err = await patchRes.json();
        return Response.json({ error: 'Failed to update RSVP', details: err }, { status: 500 });
      }

      const updated = await patchRes.json();
      return Response.json({ event: updated });
    }

    // Full event update (title, description, location, time)
    if (updates) {
      const patchRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      if (!patchRes.ok) {
        const err = await patchRes.json();
        return Response.json({ error: 'Failed to update event', details: err }, { status: 500 });
      }

      const updated = await patchRes.json();
      return Response.json({ event: updated });
    }

    return Response.json({ error: 'No action specified' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});