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
    const redirectUri = `${appDomain}/signin/google/callback`;

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

    const emailLower = email.toLowerCase();
    let user = null;

    // Check PendingSignup first
    const signups = await base44.asServiceRole.entities.PendingSignup.list();
    user = signups.find(s => s.email.toLowerCase() === emailLower) || null;

    // If not in PendingSignup, check User entity
    if (!user) {
      const users = await base44.asServiceRole.entities.User.list();
      user = users.find(u => u.email.toLowerCase() === emailLower) || null;
    }

    // User doesn't exist - needs to sign up
    if (!user) {
      return Response.json({
        success: false,
        needsSignup: true,
        email,
        full_name: name,
        userType,
        message: 'Please complete signup to continue',
      });
    }

    // User exists - return their info for login
    return Response.json({
      success: true,
      email: user.email,
      full_name: user.full_name,
      user_type: user.user_type,
      user_role: user.user_role || 'user',
      phone_number: user.phone_number || '',
    });
  } catch (error) {
    console.error('Google callback error:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
});