import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { salesMemberId } = await req.json();

    if (!salesMemberId) {
      return Response.json({ error: 'salesMemberId required' }, { status: 400 });
    }

    // Get sales rep's company email
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
    const salesMember = members?.[0];
    if (!salesMember || !salesMember.company_email) {
      return Response.json({ error: 'Sales member not found or missing company email' }, { status: 400 });
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
      const includesRep = organizerEmail === salesMember.company_email.toLowerCase() || attendeeEmails.includes(salesMember.company_email.toLowerCase());

      const startTime = new Date(event.start?.dateTime || event.start?.date);
      const endTime = new Date(event.end?.dateTime || event.end?.date);
      const isOngoing = startTime <= now && endTime > new Date(now.getTime() + 30000);

      return includesRep && isOngoing;
    });

    const hasActiveEvent = relevantEvents.length > 0;
    const newStatus = hasActiveEvent ? 'in_meeting' : 'available';

    await base44.asServiceRole.entities.SalesTeamMember.update(salesMemberId, {
      chat_status: newStatus
    });

    return Response.json({ status: newStatus, hasActiveEvent });
  } catch (error) {
    console.error('Calendar sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});