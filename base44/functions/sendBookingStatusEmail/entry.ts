import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { clientEmail, clientName, status, reason, propertyAddress } = await req.json();

    if (!clientEmail || !status || !propertyAddress) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const adminEmail = 'BradCBurke@arrivestatemedia.com';
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

    let emailSubject = '';
    let emailBody = '';

    if (status === 'approved') {
      emailSubject = `Your Booking Request Approved - ${propertyAddress}`;
      emailBody = `Great news! Your booking request has been approved!\n\nProperty: ${propertyAddress}\n\nWe're excited to work with you on this project. Our team will be in touch shortly with next steps and scheduling details.\n\nThank you!`;
    } else if (status === 'denied') {
      emailSubject = `Booking Request Update - ${propertyAddress}`;
      emailBody = `Thank you for your interest in booking with us.\n\nUnfortunately, we're unable to move forward with your booking request at this time.\n\n${reason ? `Reason: ${reason}\n` : ''}Please feel free to reach out if you'd like to discuss other options or have questions.\n\nThank you!`;
    }

    const messageLines = [
      `To: ${clientEmail}`,
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

    if (!response.ok) {
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: clientEmail,
        message_content: emailBody,
        subject: emailSubject,
        status: 'failed',
        error_message: 'Failed to send email'
      });
      throw new Error('Failed to send email');
    }

    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'email',
      recipient_type: 'client',
      recipient_email: clientEmail,
      message_content: emailBody,
      subject: emailSubject,
      status: 'success'
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error sending booking status email:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});