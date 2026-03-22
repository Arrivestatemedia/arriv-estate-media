import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId, reason } = await req.json();

    const booking = await base44.entities.Booking.get(bookingId);

    // Delete associated jobs when denying booking
    const jobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    for (const job of jobs) {
      await base44.asServiceRole.entities.Job.delete(job.id);
    }

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'denied' });

    // Send denial email via Gmail
    try {
      const gmailAccessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      
      const emailBody = reason 
        ? `Hi ${booking.client_name},\n\nUnfortunately, we're unable to approve your booking request for ${booking.property_address} on ${booking.preferred_date}.\n\nReason: ${reason}\n\nPlease feel free to reach out if you have any questions.\n\nBest regards,\nArriv Team`
        : `Hi ${booking.client_name},\n\nUnfortunately, we're unable to approve your booking request for ${booking.property_address} on ${booking.preferred_date}.\n\nPlease feel free to reach out if you have any questions.\n\nBest regards,\nArriv Team`;

      const emailMessage = `To: ${booking.client_email}\nSubject: Booking Request Update\n\n${emailBody}`;
      const encodedEmail = btoa(emailMessage).replace(/\+/g, '-').replace(/\//g, '_');

      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gmailAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: encodedEmail
        })
      });

      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: booking.client_email,
        message_content: emailBody,
        subject: 'Booking Request Update',
        status: response.ok ? 'success' : 'failed'
      });
    } catch (error) {
      console.error('Failed to send denial email:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: booking.client_email,
        message_content: `Booking denial email for ${booking.property_address}`,
        subject: 'Booking Request Update',
        status: 'failed',
        error_message: error.message
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});