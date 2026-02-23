import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const { memberId } = await req.json();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!memberId) {
      return Response.json({ error: 'memberId required' }, { status: 400 });
    }

    // Get the sales member
    const salesMember = await base44.asServiceRole.entities.SalesTeamMember.filter(
      { id: memberId }
    );
    
    if (salesMember.length === 0) {
      return Response.json({ error: 'Sales member not found' }, { status: 404 });
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

    // Store the Gmail email for this sales rep
    await base44.asServiceRole.entities.SalesTeamMember.update(memberId, {
      company_email: profile.emailAddress
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