import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendInterviewScheduledEmail, sendInterviewScheduledAdminCopy } from "../../shared/interviewScheduledEmail.ts";

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
      organizerEmail,
      applicationId,
      interviewMode
    } = body;

    const scheduled_date = scheduledDate;
    const scheduled_time = scheduledTime;
    const duration_minutes = durationMinutes;

    if (!title || !scheduled_date || !scheduled_time || !organizerName || !organizerEmail) {
      console.error('Missing required fields:', { title, scheduled_date, scheduled_time, organizerName, organizerEmail });
      return Response.json({ error: 'Missing required fields: title, scheduledDate, scheduledTime, organizerName, organizerEmail' }, { status: 400 });
    }

    console.log('Creating conference with:', { title, scheduled_date, scheduled_time, duration_minutes, participants: participants.length });

    // === Scheduling conflict detection — never double-book an interview slot ===
    const [rY, rM, rD] = scheduled_date.split('-').map(Number);
    const [rH, rMin] = scheduled_time.split(':').map(Number);
    const reqStart = new Date(Date.UTC(rY, rM - 1, rD, rH, rMin));
    const reqEnd = new Date(reqStart.getTime() + duration_minutes * 60000);

    try {
      const existingRes = await base44.asServiceRole.entities.Conference.filter(
        { status: 'scheduled' },
        '-scheduled_date',
        500
      );
      const existingList = existingRes?.data ?? existingRes ?? [];
      const newMode = interviewMode || 'human';
      for (const conf of existingList) {
        if (!conf.scheduled_date || !conf.scheduled_time) continue;
        // AI interviews run themselves (Ashley), so they never conflict with
        // a human interview or another AI interview. Only block when BOTH the
        // new and existing interviews are human (one interviewer can't be in
        // two interviews at once).
        if (newMode === 'ai' || (conf.interview_mode || 'human') === 'ai') continue;
        const [cy, cm, cd] = conf.scheduled_date.split('-').map(Number);
        const [ch, cmi] = conf.scheduled_time.split(':').map(Number);
        const cStart = new Date(Date.UTC(cy, cm - 1, cd, ch, cmi));
        const cEnd = new Date(cStart.getTime() + (conf.duration_minutes || 60) * 60000);
        // Overlap: reqStart < cEnd && cStart < reqEnd
        if (reqStart < cEnd && cStart < reqEnd) {
          console.warn('Scheduling conflict detected with conference', conf.id);
          return Response.json({
            success: false,
            conflict: true,
            error: `This time conflicts with another interview already scheduled on ${conf.scheduled_date} at ${conf.scheduled_time} ET. Please choose a different time.`,
          }, { status: 409 });
        }
      }
    } catch (conflictCheckError) {
      console.warn('Conflict check failed, proceeding:', conflictCheckError?.message);
    }

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
      status: 'scheduled',
      interview_mode: interviewMode || 'human'
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
      
      // Apply offset to get the correct UTC time (convert ET input to UTC)
      const startTime = new Date(testDate.getTime() + offsetMinutes * 60 * 1000);
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

    // Send confirmation email to the applicant (backend-side so it can't be silently lost)
    let emailSent = false;
    if (applicationId) {
      try {
        const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
        if (app) {
          await sendInterviewScheduledEmail(base44, {
            to: app.email,
            fullName: app.full_name,
            scheduledDate: scheduled_date,
            scheduledTime: scheduled_time,
            durationMinutes: duration_minutes,
            meetingLink: conference.meeting_link,
          });
          emailSent = true;

          // Send a copy to the organizer/admin so they have a record of the scheduled interview
          if (organizerEmail) {
            try {
              const adminName = organizerName || 'Admin';
              await sendInterviewScheduledAdminCopy(base44, {
                to: organizerEmail,
                adminName,
                applicantName: app.full_name,
                applicantEmail: app.email,
                scheduledDate: scheduled_date,
                scheduledTime: scheduled_time,
                durationMinutes: duration_minutes,
                meetingLink: conference.meeting_link,
              });
            } catch (adminEmailError) {
              console.warn('Admin copy email failed:', adminEmailError.message);
            }
          }
        }
      } catch (emailError) {
        console.warn('Confirmation email failed:', emailError.message);
      }
    }

    console.log('Returning success response');
    return Response.json({
      success: true,
      email_sent: emailSent,
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