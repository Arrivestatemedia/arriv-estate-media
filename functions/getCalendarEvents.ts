import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { userEmail } = await req.json();

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');

    const now = new Date().toISOString();
    const maxTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ahead

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(maxTime)}&orderBy=startTime&singleEvents=true&maxResults=50`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const err = await res.json();
      return Response.json({ error: 'Failed to fetch calendar events', details: err }, { status: 500 });
    }

    const data = await res.json();
    let events = data.items || [];

    console.log(`[getCalendarEvents] Total events: ${events.length}, filtering for userEmail: ${userEmail}`);

    // Filter to events where the user email is an attendee or organizer
    if (userEmail) {
      const emailLower = userEmail.toLowerCase();
      events = events.filter(event => {
        const isOrganizer = event.organizer?.email?.toLowerCase() === emailLower;
        const isAttendee = event.attendees?.some(a => a.email?.toLowerCase() === emailLower);
        return isOrganizer || isAttendee;
      });
    }

    console.log(`[getCalendarEvents] Filtered events: ${events.length}`);

    return Response.json({ events });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});