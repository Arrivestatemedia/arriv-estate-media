import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const url = new URL(req.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        if (!code || !state) {
            return Response.json({ error: 'Missing code or state' }, { status: 400 });
        }

        const clientId = Deno.env.get('SLACK_CLIENT_ID');
        const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET');
        const redirectUri = Deno.env.get('BASE44_APP_DOMAIN') + '/SlackAuthCallback';

        if (!clientId || !clientSecret) {
            return Response.json({ error: 'Slack credentials not configured' }, { status: 500 });
        }

        // Exchange code for token
        const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: redirectUri,
            }).toString(),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.ok) {
            return Response.json({ error: tokenData.error }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);
        const userEmail = state; // or however you're tracking the user

        // Get the sales team member and update with token
        const allMembers = await base44.asServiceRole.entities.SalesTeamMember.list();
        const member = allMembers.find(m => m.id === state);

        if (member) {
            await base44.asServiceRole.entities.SalesTeamMember.update(member.id, {
                slack_token: tokenData.access_token,
                slack_user_id: tokenData.authed_user.id,
            });
        }

        return Response.json({ success: true, message: 'Slack authenticated successfully' });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});