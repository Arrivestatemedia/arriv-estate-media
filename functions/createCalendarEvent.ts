import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { booking } = await req.json();
        
        const accessToken = await base44.asServiceRole.connectors.getAccessToken("googlecalendar");
        
        // Parse time and create proper datetime strings
        const [time, period] = booking.preferred_time.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
        const dateStr = booking.preferred_date; // YYYY-MM-DD format
        const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
        const startDateTime = `${dateStr}T${timeStr}`;
        
        const endHours = hours + 2;
        const endTimeStr = `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
        const endDateTime = `${dateStr}T${endTimeStr}`;
        
        const event = {
            summary: `Arriv Estate Media - ${booking.client_name} - ${booking.package}`,
            description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone || 'N/A'}\nNotes: ${booking.notes || 'None'}`,
            start: {
                dateTime: startDateTime,
                timeZone: 'America/New_York'
            },
            end: {
                dateTime: endDateTime,
                timeZone: 'America/New_York'
            },
            location: propertyAddress,
            attendees: [
                { email: booking.client_email }
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
        
        return Response.json({ 
            success: true, 
            eventId: calendarEvent.id,
            eventLink: calendarEvent.htmlLink 
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});