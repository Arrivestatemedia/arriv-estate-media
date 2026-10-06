import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import twilio from 'npm:twilio@5.3.3';
import { isCrossProductRoom, mintCrossProductToken } from '../../shared/canonicalVideoClient.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const apiKey = Deno.env.get('TWILIO_API_KEY');
    const apiSecret = Deno.env.get('TWILIO_API_SECRET');

    const body = await req.json();
    const { roomName, participantName } = body;
    
    if (!roomName) {
      return Response.json({ 
        error: 'roomName is required' 
      }, { status: 400 });
    }

    // CROSS-PRODUCT DELEGATION: if this is an arriv-xt- room (cross-product
    // call from Arriv One), do NOT mint a Twilio token locally. Delegate to
    // Arriv One's canonicalVideoService — the SOLE token authority for
    // cross-product video. The token is returned to the caller, NEVER persisted.
    if (isCrossProductRoom(roomName)) {
      const result = await mintCrossProductToken(roomName, participantName || '', 'tnt_estate_media');
      if (!result.success) {
        return Response.json({ error: result.error || 'canonicalVideoService failed' }, { status: 502 });
      }
      return Response.json({
        token: result.token,
        identity: participantName || '',
        roomName,
      });
    }

    if (!accountSid || !apiKey || !apiSecret) {
      console.error('Missing Twilio credentials');
      return Response.json({ 
        error: 'Twilio credentials not configured' 
      }, { status: 500 });
    }

    const AccessToken = twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const identity = participantName ? 
      `${participantName.replace(/\s+/g, '-')}-${Date.now()}` : 
      `Guest-${Date.now()}`;

    const accessToken = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: identity,
      ttl: 3600
    });

    accessToken.addGrant(new VideoGrant({ room: roomName }));

    const token = accessToken.toJwt();

    console.log(`Generated video token for room: ${roomName}, participant: ${identity}`);

    return Response.json({
      token: token,
      identity: identity,
      roomName: roomName
    });

  } catch (error) {
    console.error('Generate video token error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});