import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accessToken = await base44.asServiceRole.connectors.getAccessToken('slack');

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

        if (!channelsData.ok || !usersData.ok) {
            return Response.json({ 
                error: 'Failed to fetch Slack data',
                channels_error: channelsData.error,
                users_error: usersData.error
            }, { status: 400 });
        }

        return Response.json({
            success: true,
            channels: channelsData.channels || [],
            users: usersData.members || [],
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});