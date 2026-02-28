import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { salesMemberId, recipientExtension, recipientToken, roomName, callerName } = await req.json();

    if (!salesMemberId || !recipientExtension || !recipientToken || !roomName) {
      return Response.json({ 
        error: 'Missing required parameters: salesMemberId, recipientExtension, recipientToken, roomName' 
      }, { status: 400 });
    }

    // Get caller details for logging
    const callers = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
    if (!callers?.[0]) {
      return Response.json({ error: 'Caller not found' }, { status: 404 });
    }
    const caller = callers[0];

    // Get recipient by extension
    const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({ extension: parseInt(recipientExtension) });
    if (!recipients?.[0]) {
      return Response.json({ error: 'Recipient not found' }, { status: 404 });
    }
    const recipient = recipients[0];

    console.log(`Video call invitation sent: ${caller.full_name} → ${recipient.full_name}`);
    console.log(`Room: ${roomName}, Recipient ID: ${recipient.id}`);

    // Return success - the frontend will use dispatchEvent to notify the recipient
    return Response.json({
      success: true,
      message: 'Video call invite prepared',
      recipientId: recipient.id,
      recipientName: recipient.full_name,
      recipientToken: recipientToken,
      roomName: roomName
    });
  } catch (error) {
    console.error('Send video call invite error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});