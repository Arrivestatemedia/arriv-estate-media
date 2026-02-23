import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const clientId = Deno.env.get('SLACK_CLIENT_ID');
        const redirectUri = Deno.env.get('BASE44_APP_DOMAIN') + '/SlackAuthCallback';

        if (!clientId) {
            return Response.json({ error: 'Slack client ID not configured' }, { status: 500 });
        }

        const authUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=chat:write,channels:read,users:read&state=${user.id}`;

        return Response.json({ authUrl });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});