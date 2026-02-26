import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const adminUser = await base44.auth.me();
    
    if (!adminUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminEmail = adminUser.email;
    
    // Get Google Calendar access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
    
    // Fetch all events for the admin's email (no time filter - let Google handle it)
    const now = new Date();
    
    const calResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const calData = await calResponse.json();
    
    // Only count events that are currently ongoing AND include the admin's email
    const relevantEvents = (calData.items || []).filter(event => {
      const organizerEmail = (event.organizer?.email || '').toLowerCase();
      const attendeeEmails = (event.attendees || []).map(a => (a.email || '').toLowerCase());
      const includesAdmin = organizerEmail === adminEmail.toLowerCase() || attendeeEmails.includes(adminEmail.toLowerCase());
      
      // Check if event is currently ongoing
      const startTime = new Date(event.start?.dateTime || event.start?.date);
      const endTime = new Date(event.end?.dateTime || event.end?.date);
      const isOngoing = startTime <= now && endTime > now;
      
      console.log(`Event: ${event.summary}, Start: ${startTime.toISOString()}, End: ${endTime.toISOString()}, Now: ${now.toISOString()}, Ongoing: ${isOngoing}, IncludesAdmin: ${includesAdmin}`);
      
      return includesAdmin && isOngoing;
    });
    
    const hasActiveEvent = relevantEvents.length > 0;
    const newStatus = hasActiveEvent ? 'in_meeting' : 'available';
    
    // Update admin's chat status via updateMe
    await base44.auth.updateMe({ chat_status: newStatus });
    
    return Response.json({ status: newStatus, hasActiveEvent });
  } catch (error) {
    console.error('Admin calendar sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});