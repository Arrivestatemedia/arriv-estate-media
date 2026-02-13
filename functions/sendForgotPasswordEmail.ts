import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Get user from PendingSignup table
    const users = await base44.asServiceRole.entities.PendingSignup.filter({
      email: email
    });

    if (!users || users.length === 0) {
      // Don't reveal if email exists for security
      return Response.json({ 
        success: true
      });
    }

    const user = users[0];
    const adminEmail = 'BradCBurke@arrivestatemedia.com';
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

    const emailSubject = 'Your Arriv Password Reset';
    const emailBody = `Hello ${user.full_name},\n\nYou requested a password reset. Here is your password:\n\n${user.password_hash}\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nArriv Team`;

    const messageLines = [
      `To: ${email}`,
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
        recipient_email: email,
        message_content: emailBody,
        subject: emailSubject,
        status: 'failed',
        error_message: 'Failed to send password reset email'
      });
      throw new Error('Failed to send email');
    }

    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'email',
      recipient_type: 'client',
      recipient_email: email,
      message_content: emailBody,
      subject: emailSubject,
      status: 'success'
    });

    return Response.json({ 
      success: true
    });
  } catch (error) {
    console.error('Password reset error:', error);
    return Response.json({ 
      error: 'Failed to process password reset request.',
      details: error.message 
    }, { status: 500 });
  }
});