import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a sales team member
    const salesMember = await base44.asServiceRole.entities.SalesTeamMember.filter(
      { email: user.email }
    );
    
    if (salesMember.length === 0) {
      return Response.json({ error: 'Not a sales team member' }, { status: 403 });
    }

    // Get Gmail access token from connector
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    
    // Verify token works by fetching user's Gmail profile
    const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!profileResponse.ok) {
      return Response.json({ error: 'Failed to authorize Gmail' }, { status: 400 });
    }

    const profile = await profileResponse.json();

    // Store the Gmail email and access token for this sales rep
    await base44.asServiceRole.entities.SalesTeamMember.update(salesMember[0].id, {
      company_email: profile.emailAddress,
      gmail_authorized: true
    });

    return Response.json({ 
      success: true, 
      email: profile.emailAddress,
      message: 'Gmail authorized successfully'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});