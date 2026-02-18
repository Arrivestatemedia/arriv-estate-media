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
      const payAtClosingNote = booking.request_pay_at_closing ? '\n\n⚠️ CLIENT REQUESTED PAY-AT-CLOSING' : '';
      const emailBody = `New Booking Request\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\nTotal Price: $${booking.total_price}\nNotes: ${booking.notes || 'None'}${payAtClosingNote}\n\nView and manage this booking in your admin dashboard.`;

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

    // For pay-up-front bookings (no pay-at-closing), generate and send invoice
    if (!booking.request_pay_at_closing) {
      try {
        await base44.asServiceRole.functions.invoke('generatePayUpFrontInvoice', {
          bookingId: createdBooking.id
        });
      } catch (error) {
        console.error('Invoice generation error:', error);
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'client',
          recipient_email: booking.client_email,
          message_content: `Failed to generate invoice for booking`,
          subject: 'Booking Confirmation - Invoice Pending',
          status: 'failed',
          error_message: error.message
        });
      }
    } else {
      // For pay-at-closing, send simple confirmation
      try {
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

        const emailSubject = 'Your Booking Request Confirmation';
        const emailBody = `Thank you for your booking request!\n\nWe've received your request for:\n\nPackage: ${booking.package}\nProperty: ${propertyAddress}\nPreferred Date: ${booking.preferred_date}\nPreferred Time: ${booking.preferred_time}\n\nWe'll be in contact to discuss your Pay-at-closing details.\n\nThank you!`;

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
        console.error('Client confirmation email error:', error);
      }
    }

    // Send SMS to admin if pay-at-closing requested
    if (booking.request_pay_at_closing) {
      try {
        const adminPhone = Deno.env.get('ADMIN_PHONE');
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        const smsMessage = `PAY-AT-CLOSING REQUESTED\n\nClient: ${booking.client_name}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nPackage: ${booking.package}\nTotal: $${booking.total_price}`;

        const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: fromPhone,
            To: adminPhone,
            Body: smsMessage,
          }).toString(),
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'sms',
          recipient_type: 'admin',
          recipient_phone: adminPhone,
          message_content: smsMessage,
          status: smsResponse.ok ? 'success' : 'failed'
        });
      } catch (error) {
        console.error('Admin SMS error:', error);
      }
    }

    return Response.json({ success: true, booking: createdBooking });
  } catch (error) {
    console.error('Booking submission error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});