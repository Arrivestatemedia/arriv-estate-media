import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { salesMemberId, recipientMemberId } = await req.json();

    if (!salesMemberId || !recipientMemberId) {
      return Response.json({ error: 'salesMemberId and recipientMemberId required' }, { status: 400 });
    }

    // Get caller details (local Estate Media SalesTeamMember)
    const callers = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
    if (!callers?.[0]) {
      return Response.json({ error: 'Caller not found' }, { status: 404 });
    }
    const caller = callers[0];

    // Get recipient — a cross-tenant Arriv One employee synced as a local SalesTeamMember
    const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: recipientMemberId });
    if (!recipients?.[0]) {
      return Response.json({ error: 'Recipient not found' }, { status: 404 });
    }
    const recipient = recipients[0];

    if (!recipient.arriv_employee_id) {
      return Response.json({ error: 'Recipient is not a cross-tenant Arriv One contact' }, { status: 400 });
    }

    // Deterministic room name so both apps reference the same room
    const roomName = `cross_tenant_${salesMemberId}_${recipientMemberId}`;

    // Generate Twilio video tokens for both participants
    const twilio = await import('npm:twilio@4.10.0');
    const Twilio = twilio.default;
    const AccessToken = Twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const apiKey = Deno.env.get('TWILIO_API_KEY');
    const apiSecret = Deno.env.get('TWILIO_API_SECRET');

    if (!accountSid || !apiKey || !apiSecret) {
      return Response.json({ error: 'Missing Twilio credentials' }, { status: 500 });
    }

    // Caller uses local identity (matches Estate Media dialer registration)
    const callerToken = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: `sales_rep_${caller.id.replace(/-/g, '_')}`
    });
    callerToken.addGrant(new VideoGrant({ room: roomName }));

    // Recipient uses arriv_employee_id identity (matches Arriv One dialer registration)
    const recipientToken = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: `sales_rep_${recipient.arriv_employee_id}`
    });
    recipientToken.addGrant(new VideoGrant({ room: roomName }));

    const recipientTokenJwt = recipientToken.toJwt();

    // Notify the recipient via PendingNotification (works if recipient is logged into Estate Media)
    await base44.asServiceRole.entities.PendingNotification.create({
      recipient_id: recipient.id,
      event_type: 'incoming_video_call',
      event_data: {
        roomName,
        callerName: caller.full_name,
        callerId: caller.id,
        recipientToken: recipientTokenJwt,
        callerExtension: caller.extension,
        is_cross_tenant: true,
      },
      is_read: false,
    });

    console.log(`[CROSS_TENANT_VIDEO] ${caller.full_name} → ${recipient.full_name} (room: ${roomName})`);

    return Response.json({
      success: true,
      roomName,
      caller: {
        id: caller.id,
        name: caller.full_name,
        token: callerToken.toJwt(),
      },
      recipient: {
        id: recipient.id,
        name: recipient.full_name,
        token: recipientTokenJwt,
        extension: recipient.extension,
      },
    });
  } catch (error) {
    console.error('Cross-tenant video call error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});