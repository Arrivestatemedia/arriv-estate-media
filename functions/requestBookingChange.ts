import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { bookingId, changeRequest } = await req.json();

        // Fetch the original booking
        const booking = await base44.entities.Booking.get(bookingId);
        if (!booking) {
            return Response.json({ error: 'Booking not found' }, { status: 404 });
        }

        // Create a change request record
        const changeRequestRecord = await base44.asServiceRole.entities.BookingChangeRequest.create({
            booking_id: bookingId,
            client_email: booking.client_email,
            client_name: booking.client_name,
            original_date: booking.preferred_date,
            original_time: booking.preferred_time,
            requested_date: changeRequest.preferred_date,
            requested_time: changeRequest.preferred_time,
            is_cancellation: changeRequest.is_cancellation || false,
            notes: changeRequest.notes || '',
            status: 'pending'
        });

        // Send admin email
        const adminEmail = 'BradCBurke@arrivestatemedia.com';
        const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
        const changeType = changeRequest.is_cancellation ? 'CANCELLATION REQUEST' : 'CHANGE REQUEST';
        
        const adminEmailBody = changeRequest.is_cancellation
            ? `A client has requested to CANCEL their booking.\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nProperty: ${propertyAddress}\nOriginal Date: ${booking.preferred_date}\nOriginal Time: ${booking.preferred_time}\n\nPlease review and respond to the client.`
            : `A client has requested to CHANGE their booking.\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nProperty: ${propertyAddress}\n\nOriginal Date: ${booking.preferred_date}\nOriginal Time: ${booking.preferred_time}\n\nRequested Date: ${changeRequest.preferred_date}\nRequested Time: ${changeRequest.preferred_time}\n\nNotes: ${changeRequest.notes || 'None'}\n\nPlease review and respond to the client.`;

        const adminEmailSubject = `${changeType} - ${booking.client_name}`;

        await base44.asServiceRole.integrations.Core.SendEmail({
            to: adminEmail,
            subject: adminEmailSubject,
            body: adminEmailBody,
            from_name: 'Arriv'
        });

        // Log the admin email
        await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email',
            recipient_type: 'admin',
            recipient_email: adminEmail,
            message_content: adminEmailBody,
            subject: adminEmailSubject,
            status: 'success'
        });

        // Send client confirmation email
        const clientEmailSubject = changeRequest.is_cancellation 
            ? 'Cancellation Request Received - Arriv' 
            : 'Change Request Received - Arriv';
        
        const clientEmailBody = `Hi ${booking.client_name},\n\nWe've received your ${changeRequest.is_cancellation ? 'cancellation' : 'change'} request. Our team will review it and get back to you shortly.\n\nThank you,\nArriv Team`;

        await base44.asServiceRole.integrations.Core.SendEmail({
            to: booking.client_email,
            subject: clientEmailSubject,
            body: clientEmailBody,
            from_name: 'Arriv'
        });

        // Log the client email
        await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email',
            recipient_type: 'client',
            recipient_email: booking.client_email,
            message_content: clientEmailBody,
            subject: clientEmailSubject,
            status: 'success'
        });

        return Response.json({ success: true, changeRequestId: changeRequestRecord.id });
    } catch (error) {
        console.error('Change request error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});