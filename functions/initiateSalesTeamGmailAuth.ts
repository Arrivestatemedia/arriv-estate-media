import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get client ID from environment or config
    const GOOGLE_CLIENT_ID = Deno.env.get('VITE_GOOGLE_CLIENT_ID');
    const REDIRECT_URI = `${Deno.env.get('BASE44_APP_DOMAIN')}/api/functions/handleSalesTeamGmailCallback`;

    // Build the auth URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly');
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');
    authUrl.searchParams.append('state', user.email); // Use email as state to identify user on callback

    return Response.json({ auth_url: authUrl.toString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});