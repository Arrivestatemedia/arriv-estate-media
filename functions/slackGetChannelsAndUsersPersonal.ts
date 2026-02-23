import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { salesMemberId } = await req.json();

    // Get the sales member's Slack token
    const salesMember = await base44.asServiceRole.entities.SalesTeamMember.read(salesMemberId);

    if (!salesMember.slack_token) {
      return Response.json({ error: 'Slack not authorized for this user' }, { status: 400 });
    }

    // Fetch channels
    const channelsResponse = await fetch('https://slack.com/api/conversations.list', {
      headers: {
        Authorization: `Bearer ${salesMember.slack_token}`
      }
    });

    const channelsData = await channelsResponse.json();

    if (!channelsData.ok) {
      return Response.json({ error: channelsData.error }, { status: 400 });
    }

    return Response.json({
      channels: channelsData.channels || []
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});