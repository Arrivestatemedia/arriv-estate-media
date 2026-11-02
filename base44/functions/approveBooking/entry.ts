import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { checkClientHasAccount } from '../../shared/clientAccountCheck.ts';
import { buildBookingAcceptedMessage } from '../../shared/bookingAcceptedMessage.ts';
import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    const booking = await base44.entities.Booking.get(bookingId);

    // Update associated jobs when approving booking
    const jobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    if (jobs && jobs.length > 0) {
      for (const job of jobs) {
        await base44.asServiceRole.entities.Job.update(job.id, { status: 'open' });
      }
    }

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    // Send the booking-accepted message (email + text) to the customer
    const adminEmail = 'BradCBurke@arrivestatemedia.com';
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'https://arrivestatemedia.base44.app';
    const clientHasAccount = await checkClientHasAccount(base44, booking.client_email || '');
    const { subject: emailSubject, emailBody, smsBody } = buildBookingAcceptedMessage({
      booking,
      hasAccount: clientHasAccount,
      appDomain,
    });

    try {
      await sendBrevoEmail({
        to: booking.client_email,
        subject: emailSubject,
        textContent: emailBody,
        senderEmail: BOOKINGS_SENDER_EMAIL,
        senderName: 'Arriv Estate Media'
      });

      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: booking.client_email,
        message_content: emailBody,
        subject: emailSubject,
        status: 'success'
      });
    } catch (error) {
      console.error('Approval email error:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: booking.client_email,
        message_content: emailBody,
        subject: emailSubject,
        status: 'failed',
        error_message: error.message
      });
    }

    // Text them the same confirmation
    try {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      if (booking.client_phone && accountSid && authToken && fromPhone) {
        const to = String(booking.client_phone).startsWith('+') ? booking.client_phone : `+1${booking.client_phone}`;
        const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ From: fromPhone, To: to, Body: smsBody }).toString()
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'sms',
          recipient_type: 'client',
          recipient_phone: booking.client_phone,
          message_content: smsBody,
          status: smsResponse.ok ? 'success' : 'failed'
        });
      }
    } catch (error) {
      console.error('Approval SMS error:', error);
    }

    // Send Google Calendar invite to client
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlecalendar');

      // Parse the date and time
      const [time, period] = booking.preferred_time.split(' ');
      let [hours, minutes] = time.split(':').map(Number);

      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;

      // Create datetime string in Eastern timezone format (YYYY-MM-DDTHH:mm:ss)
      const dateStr = booking.preferred_date; // YYYY-MM-DD format
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      const startDateTime = `${dateStr}T${timeStr}`;

      // Calculate end time (2 hours later)
      const endHours = hours + 2;
      const endTimeStr = `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      const endDateTime = `${dateStr}T${endTimeStr}`;

      const calendarEvent = {
        summary: `Arriv Estate Media - ${booking.client_name} - ${booking.package}`,
        description: `Property: ${booking.street_address}, ${booking.city}, ${booking.state}\nPackage: ${booking.package}\nClient: ${booking.client_name}\nPhone: ${booking.client_phone}\nNotes: ${booking.notes || 'None'}`,
        start: { dateTime: startDateTime, timeZone: 'America/New_York' },
        end: { dateTime: endDateTime, timeZone: 'America/New_York' },
        location: `${booking.street_address}, ${booking.city}, ${booking.state}`,
        attendees: [{ email: booking.client_email }],
        sendUpdates: 'all'
      };

      console.error('Calendar Event Data:', JSON.stringify(calendarEvent));
      console.error('Using calendar email:', adminEmail);

      const calendarResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(calendarEvent)
      });

      const calendarResponseText = await calendarResponse.text();
      console.error('Calendar Status:', calendarResponse.status);
      console.error('Calendar Response:', calendarResponseText);

      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: booking.client_email,
        message_content: `Calendar invite for ${booking.property_address}`,
        subject: `Calendar Invite - ${booking.property_address}`,
        status: calendarResponse.ok ? 'success' : 'failed',
        error_message: calendarResponse.ok ? null : calendarResponseText
      });
    } catch (error) {
      console.error('Calendar error:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: booking.client_email,
        message_content: `Calendar invite for ${booking.property_address}`,
        subject: `Calendar Invite - ${booking.property_address}`,
        status: 'failed',
        error_message: error.message
      });
    }

    return Response.json({ success: true, bookingId: bookingId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});