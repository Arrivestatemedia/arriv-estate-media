// applicationAdminSms.ts
// The single admin SMS notification for a submitted Sales Growth Advisor
// application. Extracted from uploadJobApplicationFiles so that BOTH submission
// routes — the public application and the Indeed Fast-Track Careers Profile —
// send the exact same message through the exact same Twilio configuration.
//
// The message text, sender, recipient and provider are unchanged.

/**
 * Sends the admin notification for a newly submitted application.
 * Returns true only when Twilio accepted the message.
 */
export async function sendAdminNewApplicationSms({
  positionLabel,
  fullName,
  email,
}: {
  positionLabel: string;
  fullName: string;
  email: string;
}): Promise<boolean> {
  try {
    const adminPhone = Deno.env.get('ADMIN_PHONE');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!adminPhone || !twilioPhone || !accountSid || !authToken) return false;

    const smsBody = `New ${positionLabel} application received: ${fullName} (${email}). Review it in the Arriv dashboard.`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: twilioPhone, To: adminPhone, Body: smsBody }).toString(),
    });
    return res.ok;
  } catch (smsError: any) {
    console.error('Failed to send admin SMS notification:', smsError?.message || smsError);
    return false;
  }
}