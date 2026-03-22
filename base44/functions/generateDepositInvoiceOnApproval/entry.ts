import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { bookingId, actionType } = await req.json();
    
    // Generate deposit invoice first
    const depositResult = await base44.asServiceRole.functions.invoke('generateDepositInvoice', {
      bookingId
    });
    
    // Then perform the requested action (post to job board or accept for myself)
    if (actionType === 'post_to_job_board') {
      await base44.asServiceRole.functions.invoke('postBookingToJobBoard', { bookingId });
    } else if (actionType === 'accept_for_myself') {
      await base44.asServiceRole.functions.invoke('acceptBookingForMyself', { bookingId });
    }
    
    return Response.json({ 
      success: true,
      invoiceId: depositResult.data.invoiceId
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});