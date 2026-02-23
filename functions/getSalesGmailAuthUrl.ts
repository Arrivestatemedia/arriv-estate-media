import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memberId } = await req.json();
    
    if (!memberId) {
      return Response.json({ error: 'Missing memberId' }, { status: 400 });
    }

    const clientId = Deno.env.get('VITE_GOOGLE_CLIENT_ID');
    const redirectUri = `${Deno.env.get('BASE44_APP_DOMAIN')}/SalesGmailCallback?memberId=${memberId}`;
    
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly');
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');

    return Response.json({ authUrl: authUrl.toString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});