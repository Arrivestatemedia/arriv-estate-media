import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const pending = await base44.asServiceRole.entities.ScheduledBooking.filter({ status: 'pending' });

    const due = pending.filter(sb => new Date(sb.scheduled_submit_at) <= now);

    const results = [];

    for (const sb of due) {
      try {
        const packagePrices = { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 };
        const addOnPrices = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
        const pkgPrice = packagePrices[sb.package_id] || 0;
        const addOnsTotal = (sb.add_on_ids || []).reduce((sum, id) => sum + (addOnPrices[id] || 0), 0);
        const totalPrice = pkgPrice + addOnsTotal;

        const bookingPayload = {
          client_name: sb.client_name,
          client_email: sb.client_email,
          client_phone: sb.client_phone || '',
          street_address: sb.street_address,
          city: sb.city,
          state: sb.state,
          preferred_date: sb.preferred_date,
          preferred_time: sb.preferred_time,
          notes: sb.notes || '',
          package: sb.package_id,
          add_ons: sb.add_on_ids || [],
          request_pay_at_closing: sb.request_pay_at_closing || false,
          total_price: totalPrice,
        };

        const res = await base44.asServiceRole.functions.invoke('handleBookingSubmission', { booking: bookingPayload });
        const bookingId = res?.booking_id || res?.id || null;

        await base44.asServiceRole.entities.ScheduledBooking.update(sb.id, {
          status: 'submitted',
          submitted_booking_id: bookingId,
        });

        results.push({ id: sb.id, status: 'submitted' });
      } catch (err) {
        await base44.asServiceRole.entities.ScheduledBooking.update(sb.id, {
          status: 'failed',
          error_message: err.message || 'Unknown error',
        });
        results.push({ id: sb.id, status: 'failed', error: err.message });
      }
    }

    return Response.json({ processed: due.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});