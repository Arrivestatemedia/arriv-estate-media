import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { salesMemberId, channelId, text } = await req.json();

    // Get the sales member's Slack token
    const salesMember = await base44.asServiceRole.entities.SalesTeamMember.read(salesMemberId);

    if (!salesMember.slack_token) {
      return Response.json({ error: 'Slack not authorized for this user' }, { status: 400 });
    }

    // Send message with user's email in the text
    const messageText = `**From: ${salesMember.email}**: ${text}`;

    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${salesMember.slack_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: channelId,
        text: messageText
      })
    });

    const slackData = await slackResponse.json();

    if (!slackData.ok) {
      return Response.json({ error: slackData.error }, { status: 400 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});