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
    
    // Check currently ongoing calendar events (started up to 4 hours ago, ends in the future)
    const now = new Date();
    const timeMin = new Date(now.getTime() - 4 * 60 * 60000).toISOString();
    const timeMax = new Date(now.getTime() + 5 * 60000).toISOString();
    
    const calResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const calData = await calResponse.json();
    
    // Only count events that include the admin's specific email
    const relevantEvents = (calData.items || []).filter(event => {
      const organizerEmail = event.organizer?.email || '';
      const attendeeEmails = (event.attendees || []).map(a => a.email);
      
      return organizerEmail === adminEmail || attendeeEmails.includes(adminEmail);
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