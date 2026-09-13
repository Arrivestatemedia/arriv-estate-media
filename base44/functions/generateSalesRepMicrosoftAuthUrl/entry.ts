import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { memberId } = body;

    if (!memberId) return Response.json({ error: 'memberId is required' }, { status: 400 });

    // Verify admin
    const adminId = body.adminId || body.sales_member_id;
    if (!adminId) return Response.json({ error: 'Admin access required' }, { status: 403 });
    const admin = await base44.asServiceRole.entities.SalesTeamMember.get(adminId);
    if (!admin || admin.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN');
    const redirectUri = `${appDomain}/SalesRepMicrosoftAuthCallback`;
    const scope = encodeURIComponent('https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read offline_access');
    const state = encodeURIComponent(btoa(JSON.stringify({ memberId, timestamp: Date.now() })));

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&response_mode=query&prompt=consent`;

    return Response.json({ authUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});