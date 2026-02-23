import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { channelId, text, userToken } = await req.json();

        if (!channelId || !text || !userToken) {
            return Response.json({ error: 'Missing channelId, text, or userToken' }, { status: 400 });
        }

        const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel: channelId,
                text: text,
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