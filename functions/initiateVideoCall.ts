import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { salesMemberId, recipientExtension, callerName } = await req.json();

    if (!salesMemberId || !recipientExtension) {
      return Response.json({ error: 'salesMemberId and recipientExtension required' }, { status: 400 });
    }

    // Get caller details
    const callers = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
    if (!callers?.[0]) {
      return Response.json({ error: 'Caller not found' }, { status: 404 });
    }
    const caller = callers[0];

    // Get recipient by extension
    const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({ extension: parseInt(recipientExtension) });
    if (!recipients?.[0]) {
      return Response.json({ error: 'Recipient extension not found' }, { status: 404 });
    }
    const recipient = recipients[0];

    // Generate unique room name
    const roomName = `video-call-${salesMemberId}-${recipient.id}-${Date.now()}`;

    // Generate tokens for both
    const twilio = await import('npm:twilio@4.10.0');
    const Twilio = twilio.default;
    const AccessToken = Twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const callerToken = new AccessToken(
      Deno.env.get('TWILIO_ACCOUNT_SID'),
      Deno.env.get('TWILIO_API_KEY'),
      Deno.env.get('TWILIO_API_SECRET')
    );
    callerToken.addGrant(new VideoGrant({ room: roomName }));
    callerToken.identity = `${caller.id}:${caller.full_name}`;

    const recipientToken = new AccessToken(
      Deno.env.get('TWILIO_ACCOUNT_SID'),
      Deno.env.get('TWILIO_API_KEY'),
      Deno.env.get('TWILIO_API_SECRET')
    );
    recipientToken.addGrant(new VideoGrant({ room: roomName }));
    recipientToken.identity = `${recipient.id}:${recipient.full_name}`;

    console.log(`Video call initiated: ${caller.full_name} → ${recipient.full_name} (room: ${roomName})`);

    return Response.json({
      success: true,
      roomName,
      caller: {
        id: caller.id,
        name: caller.full_name,
        token: callerToken.toJwt()
      },
      recipient: {
        id: recipient.id,
        name: recipient.full_name,
        token: recipientToken.toJwt(),
        extension: recipient.extension
      }
    });
  } catch (error) {
    console.error('Video call initiation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});