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

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'denied' });

    // Send denial email to customer
    const emailBody = reason 
      ? `Hi ${booking.client_name},\n\nUnfortunately, we're unable to approve your booking request for ${booking.property_address} on ${booking.preferred_date}.\n\nReason: ${reason}\n\nPlease feel free to reach out if you have any questions.`
      : `Hi ${booking.client_name},\n\nUnfortunately, we're unable to approve your booking request for ${booking.property_address} on ${booking.preferred_date}.\n\nPlease feel free to reach out if you have any questions.`;

    await base44.integrations.Core.SendEmail({
      to: booking.client_email,
      subject: 'Booking Request Update',
      body: emailBody
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});