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
      try {
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
        if (members[0]) salesMemberEmail = members[0].email;
      } catch (_) {
        // fallback: salesMemberEmail stays empty
      }
    }

    // Always log as activity so the auto-scheduling automation fires
    const action = (!contactId || createIfNotFound) ? 'created' : 'updated';
    const contactName = `${properties.firstname || ''} ${properties.lastname || ''}`.trim();
    const notesLine = `Contact ${action}: ${[properties.firstname, properties.lastname, properties.email, properties.phone, properties.company, properties.jobtitle, properties.hs_lead_status].filter(Boolean).join(', ')}`;

    await base44.asServiceRole.entities.ActivityLog.create({
      activity_type: 'email',
      contact_name: contactName,
      contact_email: properties.email || '',
      company_name: properties.company || '',
      activity_date: new Date().toISOString(),
      notes: notesLine,
      hubspot_synced: true,
      hubspot_engagement_id: result.id,
      sales_member_id: salesMemberId || '',
      sales_member_email: salesMemberEmail || ''
    });

    return Response.json({ success: true, contact: result });
  } catch (error) {
    console.error('Update/Create HubSpot contact error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});