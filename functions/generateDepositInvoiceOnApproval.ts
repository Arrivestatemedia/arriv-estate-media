import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { bookingId, actionType } = await req.json();
    
    // Get booking
    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }
    
    // Perform the requested action (post to job board or accept for myself)
    if (actionType === 'post_to_job_board') {
      console.log('Posting booking to job board:', bookingId);
      await base44.asServiceRole.functions.invoke('postBookingToJobBoard', { bookingId });
    } else if (actionType === 'accept_for_myself') {
      console.log('Accepting booking for myself:', bookingId);
      await base44.asServiceRole.functions.invoke('acceptBookingForMyself', { bookingId });
    }
    
    return Response.json({ 
      success: true,
      message: 'Action completed'
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});