import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    // Parse the request body to get the authorization code
    const { code, userType } = await req.json();

    if (!code || !userType) {
      return Response.json(
        { error: 'Missing code or userType' },
        { status: 400 }
      );
    }

    const clientId = Deno.env.get('VITE_GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const redirectUri = `${Deno.env.get('BASE44_APP_DOMAIN')}/auth/google/callback`;

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Token exchange failed:', errorData);
      return Response.json(
        { error: 'Failed to exchange authorization code' },
        { status: 400 }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info from Google
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      return Response.json(
        { error: 'Failed to get user info from Google' },
        { status: 400 }
      );
    }

    const googleUserInfo = await userInfoResponse.json();
    const { email, name } = googleUserInfo;

    // Check if user exists via PendingSignup or User entity
    const base44 = createClientFromRequest(req);

    // Try to find existing user in PendingSignup
    let pendingSignup = null;
    try {
      const pendingSignups = await base44.asServiceRole.entities.PendingSignup.filter(
        { email },
        '-created_date',
        1
      );
      pendingSignup = pendingSignups?.[0] || null;
    } catch (err) {
      console.log('No pending signup found for email:', email);
    }

    // Return user info and pending signup data for frontend to handle
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
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
});