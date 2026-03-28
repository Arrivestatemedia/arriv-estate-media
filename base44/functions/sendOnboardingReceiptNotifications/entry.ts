import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { userId, pendingSignupId, userEmail, receiptUrl } = await req.json();

    // Get user data — try User entity first, fall back to PendingSignup
    let user = null;
    if (userId) {
      const users = await base44.asServiceRole.entities.User.filter({ id: userId });
      user = users[0];
    }
    if (!user && pendingSignupId) {
      const signups = await base44.asServiceRole.entities.PendingSignup.filter({ id: pendingSignupId });
      user = signups[0] || null;
    }
    if (!user && userEmail) {
      const signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: userEmail });
      user = signups[0] || null;
    }

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Get Gmail access token
    const gmailToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

    // Send email to media partner
    const emailSubject = 'Receipt – Media Partner Onboarding Fee';
    const emailBody = `Hi ${user.full_name.split(' ')[0]},

Thank you for completing your onboarding with Arriv Estate Media!

We've received your $50 onboarding fee payment. Your receipt has been generated and is available here:
${receiptUrl}

Your required apparel will be ordered shortly:
- Shirt: ${user.shirtFit} - Size ${user.shirtSize}
- Jacket: Size ${user.jacketSize}
${user.addGearBag ? '- Gear Bag' : ''}
${user.addWaterBottle ? '- Water Bottle' : ''}

You're now fully onboarded and can access the job board.

Best regards,
Arriv Estate Media Team`;

    const emailMessage = [
      `To: ${user.email}`,
      `Subject: ${emailSubject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      emailBody
    ].join('\r\n');

    const encodedEmail = btoa(unescape(encodeURIComponent(emailMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gmailToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedEmail })
    });

    // Send SMS to media partner
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    const smsMessage = `Arriv Estate Media: We've received your $50 onboarding fee. Your receipt has been emailed. You're now fully onboarded.`;

    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: user.phone_number,
        From: twilioPhone,
        Body: smsMessage
      })
    });

    // Send SMS to admin
    const adminPhone = Deno.env.get('BRADLEY_PHONE');
    const adminSmsMessage = `Onboarding fee received: $50 paid by ${user.full_name}.`;

    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: adminPhone,
        From: twilioPhone,
        Body: adminSmsMessage
      })
    });

    return Response.json({ success: true });

  } catch (error) {
    console.error('Error sending notifications:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});