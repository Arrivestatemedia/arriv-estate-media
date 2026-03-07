import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get the admin email from env (set as a secret)
    const adminEmail = Deno.env.get('ADMIN_EMAIL');
    if (!adminEmail) {
      return Response.json({ error: 'ADMIN_EMAIL secret not set' }, { status: 500 });
    }

    // Find the admin user by email
    const users = await base44.asServiceRole.entities.User.filter({ email: adminEmail });
    const adminUser = users[0];
    if (!adminUser) {
      return Response.json({ error: 'Admin user not found' }, { status: 404 });
    }

    // Get Google Calendar access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');

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

    await base44.asServiceRole.entities.User.update(adminUser.id, { chat_status: newStatus });

    return Response.json({ status: newStatus, hasActiveEvent });
  } catch (error) {
    console.error('Admin calendar sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});