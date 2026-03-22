import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contactId, properties, salesMemberId, createIfNotFound } = await req.json();

    if (!properties) {
      return Response.json({ error: 'properties required' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('hubspot');

    let result;

    if (!contactId || createIfNotFound) {
      // Create a new contact in HubSpot
      const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });

      if (!createRes.ok) {
        const errData = await createRes.json();
        return Response.json({ error: errData.message || 'HubSpot create failed' }, { status: 400 });
      }
      result = await createRes.json();
    } else {
      // Update existing contact
      let updateRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });

      // If update fails with 400 and email is in properties, retry without email (it likely exists elsewhere)
      if (!updateRes.ok && updateRes.status === 400 && properties.email) {
        const { email, ...propertiesWithoutEmail } = properties;
        updateRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ properties: propertiesWithoutEmail })
        });
      }

      if (!updateRes.ok) {
        const errData = await updateRes.json();
        return Response.json({ error: errData.message || 'HubSpot update failed' }, { status: 400 });
      }
      result = await updateRes.json();
    }

    // Look up sales member email for attribution
    let salesMemberEmail = '';
    if (salesMemberId) {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      if (members[0]) salesMemberEmail = members[0].email;
    }

    // Do not log HubSpot contact updates as ActivityLog entries — they are not real activities
    // and confuse the AI call queue analysis.

    return Response.json({ success: true, contact: result });
  } catch (error) {
    console.error('Update/Create HubSpot contact error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});