import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    const booking = await base44.entities.Booking.get(bookingId);

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    // Send approval email to customer
    const emailBody = `Hi ${booking.client_name},\n\nGreat news! Your booking request for ${booking.property_address} on ${booking.preferred_date} has been approved.\n\nPackage: ${booking.package}\nTotal Price: $${booking.total_price}\n\nWe'll connect you with a contractor shortly. Thank you!`;

    await base44.integrations.Core.SendEmail({
      to: booking.client_email,
      subject: 'Your Booking Has Been Approved',
      body: emailBody
    });

    // Send Google Calendar invite to client only after email is confirmed
    try {
      try {
        console.log('Attempting to get calendar access token...');
        const calendarAccessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
        console.log('Calendar access token obtained:', !!calendarAccessToken);
        
        const [time, period] = booking.preferred_time.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        const startDateTime = new Date(booking.preferred_date);
        startDateTime.setHours(hours, minutes, 0, 0);
        
        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(endDateTime.getHours() + 2);
        
        const calendarEvent = {
          summary: `Arriv Estate Media - ${booking.package}`,
          description: `Property: ${booking.property_address}\nPackage: ${booking.package}\nClient: ${booking.client_name}\nPhone: ${booking.client_phone}\nNotes: ${booking.notes || 'None'}`,
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

        const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=externalOnly', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${calendarAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(calendarEvent)
        });

        const calendarResponseText = await calendarResponse.text();
        console.log('Calendar API response:', calendarResponse.status, calendarResponseText);
        
        const calendarLogMessage = calendarResponse.ok 
          ? `Calendar invite sent for ${booking.property_address} on ${booking.preferred_date} at ${booking.preferred_time}`
          : `Calendar invite failed: ${calendarResponseText}`;
        
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'client',
          recipient_email: booking.client_email,
          message_content: calendarLogMessage,
          subject: `Arriv Estate Media - ${booking.package}`,
          status: calendarResponse.ok ? 'success' : 'failed'
        });
      } catch (error) {
        console.error('Calendar invite error:', error);
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'client',
          recipient_email: booking.client_email,
          message_content: `Failed to send calendar invite for ${booking.property_address}`,
          subject: `Arriv Estate Media - ${booking.package}`,
          status: 'failed',
          error_message: error.message
        });
      }
    }

    return Response.json({ success: true, bookingId: bookingId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});