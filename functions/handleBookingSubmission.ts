import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { booking } = await req.json();

    if (!booking) {
      return Response.json({ error: 'Booking data is required' }, { status: 400 });
    }

    const adminEmail = 'BradCBurke@arrivestatemedia.com';

    // Construct property address
    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    
    // Create booking in database
    const createdBooking = await base44.asServiceRole.entities.Booking.create({
      ...booking,
      status: 'pending'
    });

    // Calendar invite will be sent when admin approves the booking

    // Send admin notification email
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

      const emailSubject = `New Booking Request - ${booking.client_name}`;
      const emailBody = `New Booking Request\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\nTotal Price: $${booking.total_price}\nNotes: ${booking.notes || 'None'}\n\nView and manage this booking in your admin dashboard.`;

      const messageLines = [
        `To: ${adminEmail}`,
        `From: ${adminEmail}`,
        `Subject: ${emailSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        emailBody
      ];

      const messageParts = messageLines.map(line => new TextEncoder().encode(line + '\r\n'));
      const messageBytes = messageParts.reduce((acc, part) => {
        const newAcc = new Uint8Array(acc.length + part.length);
        newAcc.set(acc);
        newAcc.set(part, acc.length);
        return newAcc;
      }, new Uint8Array());

      const base64urlMessage = btoa(String.fromCharCode(...messageBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64urlMessage })
      });

      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'admin',
        recipient_email: adminEmail,
        message_content: emailBody,
        subject: emailSubject,
        status: response.ok ? 'success' : 'failed'
      });
    } catch (error) {
      console.error('Admin email error:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'admin',
        recipient_email: adminEmail,
        message_content: `New booking request from ${booking.client_name}`,
        subject: `New Booking Request - ${booking.client_name}`,
        status: 'failed',
        error_message: error.message
      });
    }

    // Send client confirmation email
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

      const emailSubject = 'Your Booking Request Confirmation';
      const emailBody = `Thank you for your booking request!\n\nWe've received your request for:\n\nPackage: ${booking.package}\nProperty: ${propertyAddress}\nPreferred Date: ${booking.preferred_date}\nPreferred Time: ${booking.preferred_time}\nTotal Price: $${booking.total_price}\n\nWe'll review your request and get back to you shortly to confirm availability and finalize the details.\n\nThank you!`;

      const messageLines = [
        `To: ${booking.client_email}`,
        `From: ${adminEmail}`,
        `Subject: ${emailSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        emailBody
      ];

      const messageParts = messageLines.map(line => new TextEncoder().encode(line + '\r\n'));
      const messageBytes = messageParts.reduce((acc, part) => {
        const newAcc = new Uint8Array(acc.length + part.length);
        newAcc.set(acc);
        newAcc.set(part, acc.length);
        return newAcc;
      }, new Uint8Array());

      const base64urlMessage = btoa(String.fromCharCode(...messageBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64urlMessage })
      });

      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: booking.client_email,
        message_content: emailBody,
        subject: emailSubject,
        status: response.ok ? 'success' : 'failed'
      });
    } catch (error) {
      console.error('Client email error:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: booking.client_email,
        message_content: `Booking confirmation for ${propertyAddress}`,
        subject: 'Your Booking Request Confirmation',
        status: 'failed',
        error_message: error.message
      });
    }

    return Response.json({ success: true, booking: createdBooking });
  } catch (error) {
    console.error('Booking submission error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});