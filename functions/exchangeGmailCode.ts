import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code, memberId } = await req.json();
    
    if (!code || !memberId) {
      return Response.json({ error: 'Missing code or memberId' }, { status: 400 });
    }

    const clientId = Deno.env.get('VITE_GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const redirectUri = `${Deno.env.get('BASE44_APP_DOMAIN')}/SalesGmailCallback?memberId=${memberId}`;

    // Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      return Response.json({ error: 'Failed to exchange code for token', details: tokenData }, { status: 500 });
    }

    // Save the access token to the SalesTeamMember
    await base44.asServiceRole.entities.SalesTeamMember.update(memberId, {
      gmail_access_token: tokenData.access_token
    });

    return Response.json({ success: true, message: 'Gmail account authorized successfully' });
  } catch (error) {
    console.error('Error exchanging Gmail code:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});