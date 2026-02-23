import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const { memberId } = await req.json();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Gmail access token using the app connector
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    
    // Get Gmail profile to get email address
    const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const profile = await profileResponse.json();
    
    // Store the email on the sales rep
    await base44.asServiceRole.entities.SalesTeamMember.update(memberId, {
      company_email: profile.emailAddress
    });
    
    return Response.json({ success: true, email: profile.emailAddress });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});