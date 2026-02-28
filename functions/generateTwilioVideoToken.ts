import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { recipientExtension, roomName, salesMemberId } = await req.json();

    if (!recipientExtension || !roomName || !salesMemberId) {
      return Response.json({ 
        error: 'Missing recipientExtension, roomName, or salesMemberId' 
      }, { status: 400 });
    }

    // Verify caller (sales member) exists
    const callers = await base44.asServiceRole.entities.SalesTeamMember.filter({
      id: salesMemberId
    });

    if (!callers || callers.length === 0) {
      return Response.json({ 
        error: 'Caller not found or unauthorized' 
      }, { status: 401 });
    }

    const caller = callers[0];

    // Verify recipient exists
    const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({
      extension: parseInt(recipientExtension)
    });

    if (!recipients || recipients.length === 0) {
      return Response.json({ 
        error: `Extension ${recipientExtension} not found` 
      }, { status: 404 });
    }

    const recipient = recipients[0];

    // Generate token for the caller
    const twilio = await import('npm:twilio@4.10.0').then(m => m.default);
    const AccessToken = twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const accessToken = new AccessToken(
      Deno.env.get('TWILIO_ACCOUNT_SID'),
      Deno.env.get('TWILIO_API_KEY'),
      Deno.env.get('TWILIO_API_SECRET')
    );

    // Generate unique identifier for the caller
    const callerIdentity = `${caller.full_name}-${caller.email}-${Date.now()}`;
    accessToken.identity = callerIdentity;
    accessToken.addGrant(new VideoGrant({ room: roomName }));

    const callerToken = accessToken.toJwt();

    // Generate token for the recipient
    const recipientAccessToken = new AccessToken(
      Deno.env.get('TWILIO_ACCOUNT_SID'),
      Deno.env.get('TWILIO_API_KEY'),
      Deno.env.get('TWILIO_API_SECRET')
    );

    const recipientIdentity = `${recipient.full_name}-${recipient.email}-${Date.now()}`;
    recipientAccessToken.identity = recipientIdentity;
    recipientAccessToken.addGrant(new VideoGrant({ room: roomName }));

    const recipientToken = recipientAccessToken.toJwt();

    // Notify recipient about incoming video call (backend can trigger UI notification)
    // For now, just send the token back to the caller
    console.log(`Video call initiated from ${caller.full_name} to ${recipient.full_name} in room: ${roomName}`);

    return Response.json({
      success: true,
      token: callerToken,
      recipientToken,
      recipientName: recipient.full_name,
      recipientExtension: recipient.extension,
      roomName
    });

  } catch (error) {
    console.error('Video token generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});