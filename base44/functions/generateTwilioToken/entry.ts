import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import twilio from 'npm:twilio@5.3.3';

// Signs the dialer's access token with a credential Twilio actually accepts.
// An API Key pair is used when Twilio accepts it; when it does not (a rotated or
// mistyped TWILIO_API_SECRET makes every issued token fail as AccessTokenInvalid
// / 20101) the account's own SID and Auth Token sign instead. Checked once per
// warm instance.
let signingCredentials = null;
async function getSigningCredentials(accountSid, apiKey, apiSecret, authToken) {
  if (signingCredentials) return signingCredentials;
  if (apiKey && apiSecret) {
    const check = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: 'Basic ' + btoa(`${apiKey}:${apiSecret}`) }
    });
    if (check.ok) {
      signingCredentials = { keySid: apiKey, keySecret: apiSecret };
      return signingCredentials;
    }
    console.error('Twilio rejected TWILIO_API_KEY/TWILIO_API_SECRET, status:', check.status);
  }
  signingCredentials = { keySid: accountSid, keySecret: authToken };
  return signingCredentials;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const apiKey = Deno.env.get('TWILIO_API_KEY');
    const apiSecret = Deno.env.get('TWILIO_API_SECRET');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID');

    const { salesMemberId, salesMemberEmail } = await req.json();
    
    if (!salesMemberId && !salesMemberEmail) {
      return Response.json({ error: 'salesMemberId or salesMemberEmail required' }, { status: 400 });
    }

    let member;
    if (salesMemberId) {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      member = members[0];
    } else {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ email: salesMemberEmail });
      member = members[0];
    }
    
    if (!member) {
      return Response.json({ error: 'Sales member not found' }, { status: 404 });
    }

    const callerNumber = member.twilio_phone_number || Deno.env.get('TWILIO_PHONE_NUMBER');
    const identity = `sales_rep_${member.id.replace(/-/g, '_')}`;

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const credentials = await getSigningCredentials(accountSid, apiKey, apiSecret, authToken);
    const token = new AccessToken(accountSid, credentials.keySid, credentials.keySecret, { identity });

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true
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