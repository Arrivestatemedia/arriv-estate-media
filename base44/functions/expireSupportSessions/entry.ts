import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Expire active support sessions past their 15-minute window and notify
 * the participant that the session has ended. Called by a scheduled workflow.
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const now = new Date();
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromPhone = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER') || Deno.env.get('TWILIO_PHONE_NUMBER');
  let expired = 0;

  try {
    const active = await base44.asServiceRole.entities.SupportSession.filter({ status: 'active' });
    for (const s of (active || [])) {
      if (new Date(s.expires_at) <= now) {
        await base44.asServiceRole.entities.SupportSession.update(s.id, {
          status: 'ended',
          ended_at: now.toISOString(),
          ended_reason: 'expired',
        });
        expired++;
        if (s.target_phone && sid && token && fromPhone) {
          try {
            const to = s.target_phone.startsWith('+') ? s.target_phone : `+1${s.target_phone.replace(/\D/g, '')}`;
            await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
              method: 'POST',
              headers: {
                Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                From: fromPhone,
                To: to,
                Body: "Your support session has ended. Text 'support: your message' to start a new one. - Arriv",
              }).toString(),
            });
          } catch (e) {
            console.error('Expiry notify failed:', e.message);
          }
        }
      }
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }

  return Response.json({ expired });
});