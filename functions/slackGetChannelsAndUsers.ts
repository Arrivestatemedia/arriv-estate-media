import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Try service role first, fall back to user if that fails
        let accessToken;
        try {
            accessToken = await base44.asServiceRole.connectors.getAccessToken('slack');
        } catch (serviceError) {
            console.error('Service role error, trying user auth:', serviceError);
            try {
                accessToken = await base44.connectors.getAccessToken('slack');
            } catch (userError) {
                console.error('User auth error:', userError);
                return Response.json({ 
                    error: 'Slack not connected. Please authorize Slack in settings first.'
                }, { status: 401 });
            }
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