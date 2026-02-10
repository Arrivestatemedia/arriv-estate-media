import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { date } = await req.json();
        
        const accessToken = await base44.asServiceRole.connectors.getAccessToken("googlecalendar");
        
        // Get events for the selected date
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay.toISOString()}&timeMax=${endOfDay.toISOString()}&singleEvents=true`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const calendarData = await response.json();
        
        // Extract busy time slots
        const busySlots = (calendarData.items || []).map(event => ({
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date
        }));

        return Response.json({ busySlots });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});