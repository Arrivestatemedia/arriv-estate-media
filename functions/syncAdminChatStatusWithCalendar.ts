import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get Google Calendar access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');

    // Fetch the admin's email from the connected Google Calendar account
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const profile = await profileRes.json();
    const adminEmail = profile.email;

    if (!adminEmail) {
      return Response.json({ error: 'Could not determine admin email from calendar connector' }, { status: 400 });
    }

    // Find the admin sales team member by email
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ email: adminEmail });
    const adminMember = members?.[0];

    if (!adminMember) {
      return Response.json({ error: 'No admin sales member found for this calendar account' }, { status: 404 });
    }

    // Fetch events for the current time window
    const now = new Date();
    const timeMin = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const calResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    const calData = await calResponse.json();

    const relevantEvents = (calData.items || []).filter(event => {
      const organizerEmail = (event.organizer?.email || '').toLowerCase();
      const attendeeEmails = (event.attendees || []).map(a => (a.email || '').toLowerCase());
      const includesAdmin = organizerEmail === adminEmail.toLowerCase() || attendeeEmails.includes(adminEmail.toLowerCase());

      const startTime = new Date(event.start?.dateTime || event.start?.date);
      const endTime = new Date(event.end?.dateTime || event.end?.date);
      const isOngoing = startTime <= now && endTime > new Date(now.getTime() + 30000);

      return includesAdmin && isOngoing;
    });

    const hasActiveEvent = relevantEvents.length > 0;
    const newStatus = hasActiveEvent ? 'in_meeting' : 'available';

    await base44.asServiceRole.entities.SalesTeamMember.update(adminMember.id, { chat_status: newStatus });

    return Response.json({ status: newStatus, hasActiveEvent, adminEmail });
  } catch (error) {
    console.error('Admin calendar sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});