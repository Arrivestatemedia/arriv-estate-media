import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import twilio from 'npm:twilio@5.3.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const apiKey = Deno.env.get('TWILIO_API_KEY');
    const apiSecret = Deno.env.get('TWILIO_API_SECRET');
    const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID');

    const { salesMemberId } = await req.json();
    if (!salesMemberId) {
      return Response.json({ error: 'salesMemberId required' }, { status: 400 });
    }

    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
    const member = members[0];
    if (!member) {
      return Response.json({ error: 'Sales member not found' }, { status: 404 });
    }

    const callerNumber = member.twilio_phone_number || Deno.env.get('TWILIO_PHONE_NUMBER');
    const identity = `sales_rep_${member.id.replace(/-/g, '_')}`;

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const token = new AccessToken(accountSid, apiKey, apiSecret, { identity });

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: false
    });
    token.addGrant(voiceGrant);

    return Response.json({
      token: token.toJwt(),
      identity,
      callerNumber,
      memberName: member.full_name
    });

  } catch (error) {
    console.error('Generate Twilio token error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});