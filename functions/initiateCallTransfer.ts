import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { recipientExtension, transferToNumber, callSid } = await req.json();

    // If extension provided, look up the rep
    if (recipientExtension) {
      const members = await base44.entities.SalesTeamMember.filter({ extension: parseInt(recipientExtension) });
      if (!members.length) {
        return Response.json({ error: 'Extension not found' }, { status: 404 });
      }
      const member = members[0];
      if (!member.twilio_phone_number) {
        return Response.json({ error: 'Rep has no phone assigned' }, { status: 400 });
      }
      return Response.json({
        success: true,
        targetNumber: member.twilio_phone_number,
        targetName: member.full_name,
        targetExtension: member.extension
      });
    }

    // If direct number provided, validate and return
    if (transferToNumber) {
      return Response.json({
        success: true,
        targetNumber: transferToNumber
      });
    }

    return Response.json({ error: 'Extension or number required' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});