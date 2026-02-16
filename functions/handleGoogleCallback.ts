import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { code, userType } = await req.json();

    if (!code || !userType) {
      return Response.json({ error: 'Missing code or userType' }, { status: 400 });
    }

    const clientId = Deno.env.get('VITE_GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'https://localhost:3000';
    const redirectUri = `${appDomain}/auth/google/callback`;

    console.log('Exchanging code for tokens', { clientId, redirectUri });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenData);
      return Response.json({ error: 'Token exchange failed: ' + tokenData.error_description }, { status: 400 });
    }

    const accessToken = tokenData.access_token;

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const googleUserInfo = await userInfoResponse.json();
    const { email, name } = googleUserInfo;

    const base44 = createClientFromRequest(req);

    let pendingSignup = null;
    try {
      const pendingSignups = await base44.asServiceRole.entities.PendingSignup.filter({ email }, '-created_date', 1);
      pendingSignup = pendingSignups?.[0] || null;
    } catch (err) {
      console.log('No pending signup found for email:', email);
    }

    return Response.json({
      success: true,
      userType,
      email,
      full_name: name,
      pendingSignup: pendingSignup ? {
        full_name: pendingSignup.full_name,
        phone_number: pendingSignup.phone_number,
        user_type: pendingSignup.user_type,
        payout_method: pendingSignup.payout_method,
        zelle_info: pendingSignup.zelle_info,
        bank_account_number: pendingSignup.bank_account_number,
        bank_account_last4: pendingSignup.bank_account_last4,
        bank_routing_number: pendingSignup.bank_routing_number,
      } : null,
    });
  } catch (error) {
    console.error('Google callback error:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
});