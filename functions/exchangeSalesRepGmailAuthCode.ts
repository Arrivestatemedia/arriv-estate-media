import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { code, state } = await req.json();
    
    const stateData = JSON.parse(atob(state));
    const { memberId } = stateData;
    
    const clientId = Deno.env.get('VITE_GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN');
    const redirectUri = `${appDomain}/SalesRepGmailAuthCallback`;
    
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
    
    // Get the Gmail address
    const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    
    const profile = await profileResponse.json();
    
    // Store the access token and refresh token for this sales rep
    const base44 = createClientFromRequest(req);
    await base44.asServiceRole.entities.SalesTeamMember.update(memberId, {
      company_email: profile.emailAddress,
      gmail_refresh_token: tokenData.refresh_token || null
    });
    
    return Response.json({ success: true, email: profile.emailAddress });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});