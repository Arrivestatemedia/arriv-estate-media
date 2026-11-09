import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';

const CLIENT_CHANGE_CUTOFF_HOURS = 24;
const OPEN_STATUSES = ['pending', 'confirmed', 'approved'];

function easternOffsetMinutes(utcMs: number) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        timeZoneName: 'shortOffset',
    });
    const label = dtf.formatToParts(new Date(utcMs)).find((p) => p.type === 'timeZoneName')?.value || 'GMT-5';
    const match = label.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    const sign = match?.[1] === '-' ? -1 : 1;
    return sign * (Number(match?.[2] || 5) * 60 + Number(match?.[3] || 0));
}

function parseTime(time: string) {
    const t = String(time || '').trim();
    const twelve = t.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
    if (twelve) {
        let hours = Number(twelve[1]) % 12;
        if (/p/i.test(twelve[3])) hours += 12;
        return { hours, minutes: Number(twelve[2]) };
    }
    const twentyFour = t.match(/^(\d{1,2}):(\d{2})$/);
    if (twentyFour) return { hours: Number(twentyFour[1]), minutes: Number(twentyFour[2]) };
    return null;
}

// Shoot start as an absolute instant (booking dates/times are Eastern).
function shootStartMs(booking: any) {
    const parts = String(booking?.preferred_date || '').slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !n)) return null;
    const [year, month, day] = parts;
    const time = parseTime(booking?.preferred_time) || { hours: 0, minutes: 0 };
    const naiveUtc = Date.UTC(year, month - 1, day, time.hours, time.minutes);
    return naiveUtc - easternOffsetMinutes(naiveUtc) * 60000;
}

// Clients may change their own booking up until 24 hours before the shoot.
function changesClosed(booking: any) {
    if (!OPEN_STATUSES.includes(booking?.status || 'pending')) return true;
    const start = shootStartMs(booking);
    if (!start) return false;
    return start - Date.now() <= CLIENT_CHANGE_CUTOFF_HOURS * 3600000;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { bookingId, changeRequest } = await req.json();

        if (!bookingId || !changeRequest) {
            return Response.json({ error: 'A booking and the requested change are required.' }, { status: 400 });
        }

        const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
        if (!booking) {
            return Response.json({ error: 'Booking not found' }, { status: 404 });
        }

        if (changesClosed(booking)) {
            return Response.json({
                error: 'Changes close 24 hours before the shoot. Please contact us at bookings@arrivestatemedia.com to change this booking.'
            }, { status: 400 });
        }

        const isCancellation = !!changeRequest.is_cancellation;

        if (!isCancellation && !changeRequest.preferred_date) {
            return Response.json({ error: 'Please choose a new date for your shoot.' }, { status: 400 });
        }

        // Create a change request record
        const changeRequestRecord = await base44.asServiceRole.entities.BookingChangeRequest.create({
            booking_id: bookingId,
            client_email: booking.client_email,
            client_name: booking.client_name,
            original_date: booking.preferred_date,
            original_time: booking.preferred_time,
            requested_date: isCancellation ? null : changeRequest.preferred_date,
            requested_time: isCancellation ? null : changeRequest.preferred_time || null,
            is_cancellation: isCancellation,
            notes: changeRequest.notes || '',
            status: 'pending'
        });

        // Notify the office and the client. The request is already saved, so a
        // delivery problem must never report the whole submission as failed.
        try {
            const adminEmail = 'BradCBurke@arrivestatemedia.com';
            const propertyAddress = [booking.street_address, booking.city, booking.state].filter(Boolean).join(', ');
            const changeType = isCancellation ? 'CANCELLATION REQUEST' : 'CHANGE REQUEST';

            const adminBody = isCancellation
                ? `A client has requested to CANCEL their booking.\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nProperty: ${propertyAddress}\nOriginal Date: ${booking.preferred_date}\nOriginal Time: ${booking.preferred_time}\n\nClient note: ${changeRequest.notes || 'None'}\n\nPlease review and respond to the client.`
                : `A client has requested to CHANGE their booking.\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nProperty: ${propertyAddress}\n\nOriginal Date: ${booking.preferred_date}\nOriginal Time: ${booking.preferred_time}\n\nRequested Date: ${changeRequest.preferred_date}\nRequested Time: ${changeRequest.preferred_time || 'Any'}\n\nNotes: ${changeRequest.notes || 'None'}\n\nPlease review and respond to the client.`;

            const adminSubject = `${changeType} - ${booking.client_name}`;
            const clientSubject = isCancellation
                ? 'Cancellation Request Received - Arriv'
                : 'Change Request Received - Arriv';
            const clientBody = `Hi ${booking.client_name},\n\nWe've received your ${isCancellation ? 'cancellation' : 'change'} request for ${booking.preferred_date || 'your shoot'}${propertyAddress ? ` at ${propertyAddress}` : ''}. Our team will review it and get back to you shortly.\n\nThank you,\nArriv Team`;

            const adminSend = await sendBrevoEmail({
                to: adminEmail,
                subject: adminSubject,
                textContent: adminBody,
                senderEmail: BOOKINGS_SENDER_EMAIL,
            }).then(() => 'success').catch(() => 'failed');

            const clientSend = booking.client_email
                ? await sendBrevoEmail({
                    to: booking.client_email,
                    subject: clientSubject,
                    textContent: clientBody,
                    senderEmail: BOOKINGS_SENDER_EMAIL,
                }).then(() => 'success').catch(() => 'failed')
                : 'failed';

            await base44.asServiceRole.entities.MessageLog.create({
                message_type: 'email',
                recipient_type: 'admin',
                recipient_email: adminEmail,
                message_content: adminBody,
                subject: adminSubject,
                status: adminSend,
            });
            if (booking.client_email) {
                await base44.asServiceRole.entities.MessageLog.create({
                    message_type: 'email',
                    recipient_type: 'client',
                    recipient_email: booking.client_email,
                    message_content: clientBody,
                    subject: clientSubject,
                    status: clientSend,
                });
            }
        } catch (notifyError) {
            console.error('Change request notification failed:', notifyError);
        }

        return Response.json({ success: true, changeRequestId: changeRequestRecord.id, isCancellation });
    } catch (error) {
        console.error('Change request error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});