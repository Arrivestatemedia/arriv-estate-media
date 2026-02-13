import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { bookingId, updates } = await req.json();

        const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
        if (!booking) {
            return Response.json({ error: 'Booking not found' }, { status: 404 });
        }

        const updatedBooking = await base44.asServiceRole.entities.Booking.update(bookingId, updates);

        return Response.json({ success: true, booking: updatedBooking });
    } catch (error) {
        console.error('Update booking error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});