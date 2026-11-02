/**
 * Booking-accepted message: what the customer reads the moment their booking is
 * approved. It confirms the shoot and points them at their account, where they
 * can view the details, update them, reschedule, cancel or book again.
 *
 * A customer without an account yet gets a pre-filled signup link instead, so
 * one click still puts them in the system.
 */
export function buildBookingAcceptedMessage({ booking, hasAccount, appDomain }: any) {
  const base = appDomain || 'https://arrivestatemedia.base44.app';
  const firstName = String(booking?.client_name || '').trim().split(' ')[0] || 'there';
  const address =
    booking?.property_address ||
    [booking?.street_address, booking?.city, booking?.state].filter(Boolean).join(', ');
  const when = [booking?.preferred_date, booking?.preferred_time].filter(Boolean).join(' at ');

  let link = `${base}/ClientBookings`;
  if (!hasAccount) {
    const params = new URLSearchParams({
      full_name: booking?.client_name || '',
      email: booking?.client_email || '',
      phone_number: booking?.client_phone || '',
    });
    link = `${base}/ClientSignup?${params.toString()}`;
  }

  const details = [
    address ? `Property: ${address}` : null,
    when ? `When: ${when}` : null,
    booking?.package ? `Package: ${booking.package}` : null,
    booking?.total_price ? `Total: $${booking.total_price}` : null,
  ].filter(Boolean).join('\n');

  const viewLine = hasAccount
    ? `You can view your full booking details anytime in your Arriv account:\n${link}`
    : `Create your Arriv account to see your booking (your details are pre-filled, and it only takes a minute):\n${link}`;

  const emailBody = `Hi ${firstName},

Good news! Your booking is confirmed.

${details}

${viewLine}

From there you can view the details, update them, reschedule, cancel, or book another shoot, all from inside the app.

If anything looks off or you need a hand, just reply to this email.

Thank you,
Brad
Arriv Estate Media`;

  const subject = `Your Booking is Confirmed – ${address}`;

  const smsBody = `Hi ${firstName}, your Arriv Estate Media shoot${address ? ` at ${address}` : ''}${when ? ` on ${when}` : ''} is confirmed. View, reschedule, cancel or book again here: ${link}`;

  return { subject, emailBody, smsBody, link };
}