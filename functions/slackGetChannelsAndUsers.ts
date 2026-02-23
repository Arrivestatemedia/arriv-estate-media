import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        let accessToken;
        try {
            accessToken = await base44.asServiceRole.connectors.getAccessToken('slack');
        } catch (tokenError) {
            console.error('Token error:', tokenError);
            return Response.json({ 
                error: 'Slack not connected. Please authorize Slack in settings first.',
                details: tokenError.message
            }, { status: 401 });
        }

        const [channelsRes, usersRes] = await Promise.all([
            fetch('https://slack.com/api/conversations.list?exclude_archived=true&limit=50', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            }),
            fetch('https://slack.com/api/users.list?limit=200', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            }),
        ]);

        const channelsData = await channelsRes.json();
        const usersData = await usersRes.json();

        if (!channelsData.ok) {
            return Response.json({ 
                error: channelsData.error || 'Failed to fetch channels'
            }, { status: 400 });
        }

        return Response.json({
            success: true,
            channels: channelsData.channels || [],
            users: usersData.ok ? (usersData.members || []) : [],
        });
    } catch (error) {
        console.error('Function error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});