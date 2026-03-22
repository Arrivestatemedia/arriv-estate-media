import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { userId } = await req.json();

    // Get user data
    const users = await base44.asServiceRole.entities.User.filter({ id: userId });
    const user = users[0];

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const totalAmount = 50 + (user.addGearBag ? 50 : 0) + (user.addWaterBottle ? 40 : 0);

    // Get Gmail access token
    const gmailToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');

    // Email to admin with product links
    const emailSubject = 'Media Partner Onboarding Complete – Action Required';
    const emailBody = `Media Partner Onboarding Complete

Media Partner: ${user.full_name}
Email: ${user.email}
Phone: ${user.phone_number}

Required Apparel (Please Order):

Shirt:
• Fit: ${user.shirtFit}
• Size: ${user.shirtSize}
• Amazon Link: https://www.amazon.com/dp/B0D7MBHCSM?ref=ppx_pop_mob_ap_share

Jacket:
• Size: ${user.jacketSize}
• Amazon Link: https://www.amazon.com/dp/B075JV7RX2?ref=ppx_pop_mob_ap_share

${user.addGearBag ? `Optional Gear Bag: YES
• Amazon Link: https://a.co/d/0d4wS3Zi

` : 'Optional Gear Bag: NO\n\n'}${user.addWaterBottle ? `Optional Water Bottle: YES
• VistaPrint Link: https://www.vistaprint.com/promotional-products/drinkware/sports-water-bottles/stainless-steel-wide-mouth-insulated-bottle-22-oz

` : 'Optional Water Bottle: NO\n\n'}Total Paid: $${totalAmount}.00

Please order their clothes.`;

    const emailMessage = [
      `To: ${adminEmail}`,
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

    // Send SMS to admin
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
    const adminPhone = Deno.env.get('BRADLEY_PHONE');

    const smsMessage = `${user.full_name} completed onboarding. Shirt: ${user.shirtSize}, Jacket: ${user.jacketSize}. Please check email to order.`;

    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: adminPhone,
        From: twilioPhone,
        Body: smsMessage
      })
    });

    return Response.json({ success: true });

  } catch (error) {
    console.error('Error sending admin notification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});