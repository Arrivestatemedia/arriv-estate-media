import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { contactId, properties, salesMemberId, createIfNotFound } = body;

    if (!properties) {
      return Response.json({ error: 'properties required' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('hubspot');

    let result = null;
    let hubspotId = null;
    let hubspotSynced = false;

    if (!contactId || createIfNotFound) {
      // Try to create a new contact in HubSpot
      const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });

      if (createRes.ok) {
        result = await createRes.json();
        hubspotId = result.id;
        hubspotSynced = true;
      } else if (createRes.status === 409) {
        // Contact already exists — search for them and update instead
        const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filterGroups: [{
              filters: [{
                propertyName: 'email',
                operator: 'EQ',
                value: properties.email
              }]
            }],
            limit: 1
          })
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const existingId = searchData?.results?.[0]?.id;
          if (existingId) {
            const updateRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ properties })
            });
            if (updateRes.ok) {
              result = await updateRes.json();
              hubspotId = result.id;
              hubspotSynced = true;
            }
          }
        }
        // Even if we couldn't update, we still proceed to log the activity
      }
      // Any other error: we still proceed to log the activity below
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

      // If update fails with 400 and email is in properties, retry without email
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

      if (updateRes.ok) {
        result = await updateRes.json();
        hubspotId = result.id;
        hubspotSynced = true;
      }
      // On any error, still proceed to log the activity
    }

    // Use salesMemberEmail if passed directly; fallback to DB lookup
    let salesMemberEmail = body.salesMemberEmail || '';
    if (!salesMemberEmail && salesMemberId) {
      try {
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
        if (members[0]) salesMemberEmail = members[0].email;
      } catch (_) {}
    }

    // ALWAYS log as activity so the auto-scheduling automation fires
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
      hubspot_synced: hubspotSynced,
      hubspot_engagement_id: hubspotId || '',
      sales_member_id: salesMemberId || '',
      sales_member_email: salesMemberEmail || ''
    });

    return Response.json({ success: true, contact: result || { properties } });
  } catch (error) {
    console.error('Update/Create HubSpot contact error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});