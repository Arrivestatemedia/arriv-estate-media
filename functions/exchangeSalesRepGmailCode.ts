import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { code, state } = await req.json();
    
    const stateData = JSON.parse(atob(state));
    const { memberId } = stateData;
    
    const clientId = Deno.env.get('VITE_GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN');
    const redirectUri = `${appDomain}/SalesGmailCallback`;
    
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }).toString()
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      return Response.json({ error: 'Failed to get access token' }, { status: 400 });
    }
    
    // Store the access token in the sales team member record
    await base44.asServiceRole.entities.SalesTeamMember.update(memberId, {
      gmail_access_token: tokenData.access_token,
      gmail_refresh_token: tokenData.refresh_token || null
    });
    
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});