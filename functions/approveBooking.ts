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

    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'email',
      recipient_type: 'client',
      recipient_email: booking.client_email,
      message_content: emailBody,
      subject: 'Your Booking Has Been Approved',
      status: 'success'
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});