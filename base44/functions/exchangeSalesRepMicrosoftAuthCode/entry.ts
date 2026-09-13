import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getMicrosoftEmail } from "../../shared/microsoftGraphProvider.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { code, state } = await req.json();

    if (!code || !state) return Response.json({ error: 'Missing code or state' }, { status: 400 });

    const stateData = JSON.parse(atob(decodeURIComponent(state)));
    const { memberId } = stateData;

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
    const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN');
    const redirectUri = `${appDomain}/SalesRepMicrosoftAuthCallback`;

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        scope: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read offline_access',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return Response.json({ error: 'Failed to get Microsoft access token: ' + JSON.stringify(tokenData) }, { status: 400 });
    }

    // Get the rep's email from Graph /me
    const msEmail = await getMicrosoftEmail(tokenData.access_token);

    await base44.asServiceRole.entities.SalesTeamMember.update(memberId, {
      email_connection_type: 'microsoft_oauth',
      microsoft_access_token: tokenData.access_token,
      microsoft_refresh_token: tokenData.refresh_token || null,
      microsoft_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
      microsoft_email: msEmail,
      company_email: msEmail,
      // Clear other connection types
      gmail_access_token: null,
      gmail_refresh_token: null,
      gmail_token_expires_at: null,
      smtp_host: null,
      smtp_port: null,
      smtp_username: null,
      smtp_password_encrypted: null,
    });

    return Response.json({ success: true, email: msEmail });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});