import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { channelId, text } = await req.json();

        if (!channelId || !text) {
            return Response.json({ error: 'Missing channelId or text' }, { status: 400 });
        }

        // Format message with sender attribution
        const formattedText = `*From: ${user.email}*\n${text}`;

        const accessToken = await base44.asServiceRole.connectors.getAccessToken('slack');

        const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel: channelId,
                text: formattedText,
            }),
        });

        const result = await response.json();

        if (!result.ok) {
            return Response.json({ error: result.error }, { status: 400 });
        }

        return Response.json({ success: true, ts: result.ts });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});