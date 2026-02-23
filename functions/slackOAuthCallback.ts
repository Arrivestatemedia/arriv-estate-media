import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // sales member ID
    const error = url.searchParams.get('error');

    if (error) {
      return Response.json({ error: error }, { status: 400 });
    }

    if (!code || !state) {
      return Response.json({ error: 'Missing code or state' }, { status: 400 });
    }

    // Exchange code for token using Slack API
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: Deno.env.get('SLACK_CLIENT_ID'),
        client_secret: Deno.env.get('SLACK_CLIENT_SECRET'),
        code: code,
        redirect_uri: 'https://app.arrivestatemedia.com/slackOAuthCallback'
      }).toString()
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok) {
      return Response.json({ error: tokenData.error }, { status: 400 });
    }

    // Update the sales team member with the token
    await base44.asServiceRole.entities.SalesTeamMember.update(state, {
      slack_token: tokenData.access_token,
      slack_workspace_id: tokenData.team.id
    });

    // Redirect back to admin page
    return Response.redirect('https://app.arrivestatemedia.com/AdminSalesSignup?slack_connected=true', 302);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});