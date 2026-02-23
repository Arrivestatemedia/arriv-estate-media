import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        let accessToken;
        try {
            // Use user auth directly
            accessToken = await base44.connectors.getAccessToken('slack');
        } catch (error) {
            console.error('Failed to get Slack token:', error.message);
            return Response.json({ 
                error: 'Slack not connected. Please authorize Slack first.'
            }, { status: 401 });
        }

        const channelsRes = await fetch('https://slack.com/api/conversations.list?exclude_archived=true&limit=50', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        const channelsData = await channelsRes.json();

        if (!channelsData.ok) {
            return Response.json({ 
                error: channelsData.error || 'Failed to fetch channels'
            }, { status: 400 });
        }

        return Response.json({
            success: true,
            channels: channelsData.channels || [],
        });
    } catch (error) {
        console.error('Function error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});