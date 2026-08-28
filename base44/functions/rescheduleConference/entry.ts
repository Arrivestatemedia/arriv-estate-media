import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendInterviewRescheduledEmail, sendInterviewRescheduledAdminCopy } from "../../shared/interviewScheduledEmail.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { conferenceId, scheduledDate, scheduledTime, durationMinutes } = body;

    if (!conferenceId || !scheduledDate || !scheduledTime) {
      return Response.json({ error: "conferenceId, scheduledDate, scheduledTime are required" }, { status: 400 });
    }

    const duration_minutes = durationMinutes || 60;

    // Load the conference
    const conference = await base44.asServiceRole.entities.Conference.get(conferenceId);
    if (!conference) {
      return Response.json({ error: "Conference not found" }, { status: 404 });
    }

    // === Conflict detection — exclude this conference itself ===
    const [rY, rM, rD] = scheduledDate.split('-').map(Number);
    const [rH, rMin] = scheduledTime.split(':').map(Number);
    const reqStart = new Date(Date.UTC(rY, rM - 1, rD, rH, rMin));
    const reqEnd = new Date(reqStart.getTime() + duration_minutes * 60000);

    try {
      const existingRes = await base44.asServiceRole.entities.Conference.filter(
        { status: 'scheduled' },
        '-scheduled_date',
        500
      );
      const existingList = existingRes?.data ?? existingRes ?? [];
      const confMode = conference.interview_mode || 'human';
      for (const conf of existingList) {
        if (conf.id === conferenceId) continue; // skip self
        if (!conf.scheduled_date || !conf.scheduled_time) continue;
        // AI interviews can run concurrently (Ashley handles parallel sessions);
        // only block overlaps involving a human interview.
        if (confMode === 'ai' && (conf.interview_mode || 'human') === 'ai') continue;
        const [cy, cm, cd] = conf.scheduled_date.split('-').map(Number);
        const [ch, cmi] = conf.scheduled_time.split(':').map(Number);
        const cStart = new Date(Date.UTC(cy, cm - 1, cd, ch, cmi));
        const cEnd = new Date(cStart.getTime() + (conf.duration_minutes || 60) * 60000);
        if (reqStart < cEnd && cStart < reqEnd) {
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

    // Update the conference record
    await base44.asServiceRole.entities.Conference.update(conferenceId, {
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      duration_minutes: duration_minutes,
      status: 'scheduled',
    });

    // Update the Google Calendar event (PATCH the existing event)
    if (conference.google_calendar_event_id) {
      try {
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
        const [year, month, day] = scheduledDate.split('-').map(Number);
        const [hours, minutes] = scheduledTime.split(':').map(Number);
        const testDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
        const nyFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        });
        const parts = nyFormatter.formatToParts(testDate);
        const nyTime: Record<string, string> = {};
        parts.forEach(p => { nyTime[p.type] = p.value; });
        const nyHours = parseInt(nyTime.hour);
        const nyMinutes = parseInt(nyTime.minute);
        const offsetMinutes = (hours - nyHours) * 60 + (minutes - nyMinutes);
        const startTime = new Date(testDate.getTime() + offsetMinutes * 60 * 1000);
        const endTime = new Date(startTime.getTime() + duration_minutes * 60000);

        const patchBody = {
          start: { dateTime: startTime.toISOString(), timeZone: 'America/New_York' },
          end: { dateTime: endTime.toISOString(), timeZone: 'America/New_York' },
        };
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${conference.google_calendar_event_id}?sendUpdates=all`,
          {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(patchBody),
          }
        );
        if (!calRes.ok) {
          const err = await calRes.json().catch(() => ({}));
          console.warn('Calendar update failed:', err?.error?.message || calRes.status);
        }
      } catch (calErr) {
        console.warn('Calendar update error:', calErr.message);
      }
    }

    // Send reschedule emails to the applicant + admin copy
    let emailSent = false;
    const applicant = conference.participants?.[0];
    if (applicant?.email) {
      try {
        await sendInterviewRescheduledEmail(base44, {
          to: applicant.email,
          fullName: applicant.name || '',
          scheduledDate,
          scheduledTime,
          durationMinutes: duration_minutes,
          meetingLink: conference.meeting_link,
        });
        emailSent = true;

        if (conference.organizer_email) {
          try {
            await sendInterviewRescheduledAdminCopy(base44, {
              to: conference.organizer_email,
              adminName: conference.organizer_name || 'Admin',
              applicantName: applicant.name || '',
              applicantEmail: applicant.email,
              scheduledDate,
              scheduledTime,
              durationMinutes: duration_minutes,
              meetingLink: conference.meeting_link,
            });
          } catch (adminEmailError) {
            console.warn('Admin copy email failed:', adminEmailError.message);
          }
        }
      } catch (emailError) {
        console.warn('Reschedule email failed:', emailError.message);
      }
    }

    return Response.json({ success: true, email_sent: emailSent });
  } catch (error) {
    console.error('rescheduleConference error:', error.message);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
});