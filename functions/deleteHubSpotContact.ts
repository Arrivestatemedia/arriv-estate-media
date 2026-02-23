import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contactId, salesMemberId } = await req.json();

    if (!contactId) {
      return Response.json({ error: 'contactId required' }, { status: 400 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');

    const deleteRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!deleteRes.ok) {
      const errData = await deleteRes.json();
      return Response.json({ error: errData.message || 'HubSpot delete failed' }, { status: 400 });
    }

    // Log deletion as activity
    if (salesMemberId) {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      const salesMemberEmail = members[0]?.email || '';

      await base44.asServiceRole.entities.ActivityLog.create({
        activity_type: 'email',
        contact_email: '',
        activity_date: new Date().toISOString(),
        notes: `Deleted HubSpot contact ${contactId}`,
        hubspot_synced: true,
        sales_member_id: salesMemberId,
        sales_member_email: salesMemberEmail
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Delete HubSpot contact error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});