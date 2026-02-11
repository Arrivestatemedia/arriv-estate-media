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

    await base44.asServiceRole.entities.Job.create({
      title: `Photography - ${booking.property_address}`,
      type: 'photo',
      description: `Property: ${booking.property_address}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
      location: booking.property_address,
      date: booking.preferred_date,
      start_time: booking.preferred_time,
      duration_hours: 2,
      pay_rate: booking.total_price,
      status: 'booked',
      booked_by: user.email,
      booked_by_name: user.full_name,
      from_booking: true
    });

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    // Send approval email and calendar invite
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');
      
      const eventStartTime = new Date(`${booking.preferred_date}T${booking.preferred_time || '09:00'}`);
      const eventEndTime = new Date(eventStartTime.getTime() + 2 * 60 * 60 * 1000);

      const calendarEvent = {
        summary: `Photography Session - ${booking.property_address}`,
        description: `Package: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
        location: booking.property_address,
        start: {
          dateTime: eventStartTime.toISOString(),
          timeZone: 'America/New_York'
        },
        end: {
          dateTime: eventEndTime.toISOString(),
          timeZone: 'America/New_York'
        },
        attendees: [
          { email: booking.client_email }
        ]
      };

      const calendarRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(calendarEvent)
      });

      if (!calendarRes.ok) {
        console.error('Failed to create calendar event:', await calendarRes.text());
      }
    } catch (calError) {
      console.error('Calendar integration error:', calError);
    }

    // Send approval email to customer
    await base44.integrations.Core.SendEmail({
      to: booking.client_email,
      subject: 'Your Booking Has Been Approved ✓',
      body: `Hi ${booking.client_name},\n\nGreat news! Your booking request has been approved!\n\nProperty: ${booking.property_address}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time || 'TBD'}\nPackage: ${booking.package?.replace(/_/g, ' ')}\nTotal Price: $${booking.total_price}\n\nA calendar invite has been sent to your email. See you soon!\n\nBest regards,\nArriv Team`
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});