import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { job, mediaPartnerEmail } = await req.json();
        
        const accessToken = await base44.asServiceRole.connectors.getAccessToken("googlecalendar");
        
        // Parse time and create proper datetime strings
        const [time, period] = job.start_time.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        const dateStr = job.date; // YYYY-MM-DD format
        const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
        const startDateTime = `${dateStr}T${timeStr}`;
        
        const endHours = hours + (job.duration_hours || 2);
        const endTimeStr = `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
        const endDateTime = `${dateStr}T${endTimeStr}`;
        
        // Mask client name - show first name + first initial of last name
        const maskedClientName = job.client_name 
            ? (() => {
                const parts = job.client_name.split(' ');
                return parts.length > 1 
                    ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
                    : parts[0];
              })()
            : 'N/A';

        const event = {
            summary: `Arriv Estate Media - ${job.title}`,
            description: `Client: ${maskedClientName}\n\nJob Details:\n${job.description || ''}\n\nLocation: ${job.location}\nPay: $${job.pay_rate}`,
            start: {
                dateTime: startDateTime,
                timeZone: 'America/New_York'
            },
            end: {
                dateTime: endDateTime,
                timeZone: 'America/New_York'
            },
            location: job.location,
            attendees: [
                { email: mediaPartnerEmail }
            ]
        };

        const response = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(event)
            }
        );

        const calendarEvent = await response.json();
        
        // Log calendar invite to MessageLog
        try {
            await base44.asServiceRole.entities.MessageLog.create({
                message_type: 'email',
                recipient_type: 'media_partner',
                recipient_email: mediaPartnerEmail,
                subject: `Calendar Invite: ${event.summary}`,
                message_content: `Calendar invite sent for ${event.summary} on ${job.date} at ${job.start_time}`,
                job_id: job.id,
                status: response.ok ? 'success' : 'failed',
                error_message: response.ok ? null : JSON.stringify(calendarEvent)
            });
        } catch (logError) {
            console.error('Failed to log calendar invite:', logError);
        }
        
        return Response.json({ 
            success: true, 
            eventId: calendarEvent.id,
            eventLink: calendarEvent.htmlLink 
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});