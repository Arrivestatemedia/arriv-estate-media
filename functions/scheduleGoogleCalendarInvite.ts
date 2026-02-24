import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    
    // Build attendees list: clients + info@arrivestatemedia.com
    const attendees = (clientEmails || []).map(email => ({
      email: email,
      responseStatus: 'needsAction'
    }));
    
    // Add info@arrivestatemedia.com as CC
    attendees.push({
      email: 'info@arrivestatemedia.com',
      responseStatus: 'accepted',
      optional: true
    });
    
    // Create calendar event from sales rep's email
    const event = {
      summary: title,
      description: description || '',
      start: {
        dateTime: startTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: endTime,
        timeZone: 'UTC'
      },
      organizer: salesRepCompanyEmail ? { email: salesRepCompanyEmail } : undefined,
      attendees: attendees,
      conferenceData: {
        conferenceSolution: {
          key: { conferenceSolutionKey: 'hangoutsMeet' }
        }
      }
    };

    const calResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
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