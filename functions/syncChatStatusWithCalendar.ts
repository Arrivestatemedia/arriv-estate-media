import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { salesMemberId } = await req.json();
    
    // Get Google Calendar access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
    
    // Check current calendar events
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 5 * 60000).toISOString(); // Check next 5 minutes
    
    const calResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const calData = await calResponse.json();
    const hasActiveEvent = calData.items && calData.items.length > 0;
    
    // Update chat status
    const newStatus = hasActiveEvent ? 'in_meeting' : 'available';
    
    if (salesMemberId) {
      await base44.entities.SalesTeamMember.update(salesMemberId, { 
        chat_status: newStatus 
      });
    }
    
    return Response.json({ status: newStatus, hasActiveEvent });
  } catch (error) {
    console.error('Calendar sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});