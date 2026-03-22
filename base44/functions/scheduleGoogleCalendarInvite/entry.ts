import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { 
      title, 
      description, 
      startTime, 
      endTime, 
      clientEmails,
      salesRepCompanyEmail
    } = await req.json();
    
    if (!title || !startTime || !endTime) {
      return Response.json({ error: 'Missing required fields: title, startTime, endTime' }, { status: 400 });
    }

    // Get Google Calendar access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
    
    // Build attendees list: clients + sales rep + info@arrivestatemedia.com
    const attendees = (clientEmails || []).map(email => ({
      email: email,
      responseStatus: 'needsAction'
    }));

    // Add the sales rep as an attendee so they appear on the invite
    if (salesRepCompanyEmail) {
      attendees.push({
        email: salesRepCompanyEmail,
        responseStatus: 'accepted'
      });
    }
    
    // Add info@arrivestatemedia.com as optional
    attendees.push({
      email: 'info@arrivestatemedia.com',
      responseStatus: 'accepted',
      optional: true
    });
    
    const event = {
      summary: title,
      description: description || '',
      start: {
        dateTime: startTime,
        timeZone: 'America/New_York'
      },
      end: {
        dateTime: endTime,
        timeZone: 'America/New_York'
      },
      attendees: attendees,
      guestsCanInviteOthers: false,
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    };

    const calResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }
    );

    const calEvent = await calResponse.json();
    
    if (!calResponse.ok) {
      return Response.json({ error: calEvent.error?.message || 'Failed to create event' }, { status: 400 });
    }

    return Response.json({ 
      success: true, 
      eventId: calEvent.id,
      htmlLink: calEvent.htmlLink
    });
  } catch (error) {
    console.error('Calendar invite error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});