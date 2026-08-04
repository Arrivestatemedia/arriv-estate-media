import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    console.log('=== scheduleConference called ===');
    const base44 = createClientFromRequest(req);

    let body;
    try {
      body = await req.json();
      console.log('Request body:', JSON.stringify(body, null, 2));
    } catch (e) {
      console.error('Failed to parse JSON:', e.message);
      return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const {
      title,
      description,
      scheduledDate,
      scheduledTime,
      durationMinutes = 60,
      participants = [],
      channelId,
      organizerId,
      organizerName,
      organizerEmail
    } = body;

    const scheduled_date = scheduledDate;
    const scheduled_time = scheduledTime;
    const duration_minutes = durationMinutes;

    if (!title || !scheduled_date || !scheduled_time || !organizerName || !organizerEmail) {
      console.error('Missing required fields:', { title, scheduled_date, scheduled_time, organizerName, organizerEmail });
      return Response.json({ error: 'Missing required fields: title, scheduledDate, scheduledTime, organizerName, organizerEmail' }, { status: 400 });
    }

    console.log('Creating conference with:', { title, scheduled_date, scheduled_time, duration_minutes, participants: participants.length });

    // Generate unique room name
    const roomName = `conf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create conference record
    console.log('Creating Conference entity...');
    const conference = await base44.asServiceRole.entities.Conference.create({
      title,
      description: description || '',
      scheduled_date: scheduled_date,
      scheduled_time: scheduled_time,
      duration_minutes: duration_minutes,
      room_name: roomName,
      meeting_link: `${Deno.env.get('BASE44_APP_DOMAIN')}/Conference?room=${encodeURIComponent(roomName)}`,
      organizer_id: organizerId || null,
      organizer_name: organizerName,
      organizer_email: organizerEmail,
      participants: participants.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email
      })),
      channel_id: channelId || null,
      status: 'scheduled'
    });
    console.log('Conference created:', conference.id, conference.meeting_link);

    // Create Google Calendar event (replicate exact pattern from scheduleGoogleCalendarInvite)
    try {
      console.log('Getting Google Calendar access token...');
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
      
      const [year, month, day] = scheduled_date.split('-').map(Number);
      const [hours, minutes] = scheduled_time.split(':').map(Number);
      
      // Create a UTC date as reference
      const testDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
      
      // Get what time this UTC date is in America/New_York
      const nyFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      const parts = nyFormatter.formatToParts(testDate);
      const nyTime = {};
      parts.forEach(p => nyTime[p.type] = p.value);
      
      // Calculate the offset needed to convert user's local time to UTC
      const nyHours = parseInt(nyTime.hour);
      const nyMinutes = parseInt(nyTime.minute);
      const offsetMinutes = (hours - nyHours) * 60 + (minutes - nyMinutes);
      
      // Apply offset to get the correct UTC time, plus one day to match intended date
      const startTime = new Date(testDate.getTime() + offsetMinutes * 60 * 1000 + 86400000);
      const endTime = new Date(startTime.getTime() + duration_minutes * 60000);

      const attendees = participants.map(p => ({
        email: p.email,
        displayName: p.name,
        responseStatus: 'needsAction'
      }));
      
      // Add organizer as accepted
      attendees.push({
        email: organizerEmail,
        displayName: organizerName,
        responseStatus: 'accepted'
      });

      const event = {
        summary: title,
        description: `${description || ''}\n\nJoin Video Conference: ${conference.meeting_link}`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'America/New_York'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'America/New_York'
        },
        attendees: attendees,
        guestsCanInviteOthers: false
      };

      console.log('Sending calendar invite with sendUpdates=all...');
      const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      });

      const calendarEvent = await calendarResponse.json();
      
      if (!calendarResponse.ok) {
        console.warn('Calendar error:', calendarEvent.error?.message || 'Failed to create event');
      } else {
        await base44.entities.Conference.update(conference.id, {
          google_calendar_event_id: calendarEvent.id
        });
        console.log('Calendar event created with invites sent:', calendarEvent.id);
      }
    } catch (calendarError) {
      console.warn('Failed to create calendar invite:', calendarError.message);
      // Continue - conference is created even if calendar fails
    }

    console.log('Returning success response');
    return Response.json({
      success: true,
      conference: {
        id: conference.id,
        title: conference.title,
        roomName: conference.room_name,
        meetingLink: conference.meeting_link,
        scheduledDate: conference.scheduled_date,
        scheduledTime: conference.scheduled_time
      }
    });
  } catch (error) {
    console.error('=== Conference scheduling error ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return Response.json({ error: error.message || 'Unknown error', stack: error.stack }, { status: 500 });
  }
});