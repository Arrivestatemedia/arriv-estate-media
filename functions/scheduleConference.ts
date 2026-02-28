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
      scheduledDate,
      scheduledTime,
      durationMinutes = 60,
      participants = [],
      channelId
    } = await req.json();

    if (!title || !scheduledDate || !scheduledTime) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generate unique room name
    const roomName = `conf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create conference record
    const conference = await base44.entities.Conference.create({
      title,
      description: description || '',
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      duration_minutes: durationMinutes,
      room_name: roomName,
      meeting_link: `${Deno.env.get('BASE44_APP_DOMAIN')}/Conference?room=${encodeURIComponent(roomName)}`,
      organizer_id: user.id,
      organizer_name: user.full_name,
      organizer_email: user.email,
      participants: participants.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email
      })),
      channel_id: channelId || null,
      status: 'scheduled'
    });

    // Create Google Calendar event
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
      
      const [year, month, day] = scheduledDate.split('-');
      const [hours, minutes] = scheduledTime.split(':');
      const startTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

      const attendees = [
        { email: user.email, displayName: user.full_name, responseStatus: 'accepted' },
        ...participants.map(p => ({
          email: p.email,
          displayName: p.name,
          responseStatus: 'needsAction'
        }))
      ];

      const event = {
        summary: title,
        description: `${description}\n\nJoin Video Conference: ${conference.meeting_link}`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'UTC'
        },
        attendees: attendees,
        conferenceData: {
          createRequest: {
            requestId: `conf-${conference.id}`
          }
        }
      };

      const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      });

      if (calendarResponse.ok) {
        const calendarEvent = await calendarResponse.json();
        await base44.entities.Conference.update(conference.id, {
          google_calendar_event_id: calendarEvent.id
        });
      }
    } catch (calendarError) {
      console.warn('Failed to create Google Calendar event:', calendarError.message);
      // Continue - conference is created even if calendar fails
    }

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
    console.error('Conference scheduling error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});