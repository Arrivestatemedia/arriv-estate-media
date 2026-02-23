import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memberId } = await req.json();
    
    const clientId = Deno.env.get('VITE_GOOGLE_CLIENT_ID');
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN');
    const redirectUri = `${appDomain}/SalesGmailCallback`;
    
    const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly');
    const state = btoa(JSON.stringify({ memberId, timestamp: Date.now() }));
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&state=${state}`;
    
    return Response.json({ authUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});