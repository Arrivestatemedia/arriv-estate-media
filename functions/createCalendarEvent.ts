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
        
        // Parse time and create start/end datetime
        const [time, period] = booking.preferred_time.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        const startDateTime = new Date(booking.preferred_date);
        startDateTime.setHours(hours, minutes, 0, 0);
        
        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(hours + 2, minutes, 0, 0); // 2 hour default duration
        
        const event = {
            summary: `Booking: ${booking.property_address}`,
            description: `Client: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone || 'N/A'}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'None'}`,
            start: {
                dateTime: startDateTime.toISOString(),
                timeZone: 'America/New_York'
            },
            end: {
                dateTime: endDateTime.toISOString(),
                timeZone: 'America/New_York'
            },
            location: booking.property_address,
            attendees: [
                { email: booking.client_email }
            ]
        };

        const response = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
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