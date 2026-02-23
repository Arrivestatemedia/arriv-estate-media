import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { contactId, properties, salesMemberId } = await req.json();

    if (!contactId || !properties) {
      return Response.json({ error: 'contactId and properties required' }, { status: 400 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');

    const updateRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    });

    if (!updateRes.ok) {
      const errData = await updateRes.json();
      return Response.json({ error: errData.message || 'HubSpot update failed' }, { status: 400 });
    }

    const updated = await updateRes.json();

    // Log as activity if salesMemberId provided
    if (salesMemberId) {
      await base44.asServiceRole.entities.ActivityLog.create({
        activity_type: 'email',
        contact_name: `${properties.firstname || ''} ${properties.lastname || ''}`.trim(),
        contact_email: properties.email || '',
        company_name: properties.company || '',
        activity_date: new Date().toISOString(),
        notes: `HubSpot contact updated: ${Object.keys(properties).join(', ')}`,
        hubspot_synced: true,
        hubspot_engagement_id: updated.id
      });
    }

    return Response.json({ success: true, contact: updated });
  } catch (error) {
    console.error('Update HubSpot contact error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});