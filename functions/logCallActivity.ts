import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const {
      salesMemberId,
      toNumber,
      contactName,
      contactEmail,
      companyName,
      durationSeconds,
      notes,
      callSid
    } = await req.json();

    if (!salesMemberId) {
      return Response.json({ error: 'salesMemberId required' }, { status: 400 });
    }

    const durationMinutes = Math.ceil((durationSeconds || 0) / 60);

    // Create ActivityLog record
    const activity = await base44.asServiceRole.entities.ActivityLog.create({
      activity_type: 'call',
      contact_name: contactName || '',
      contact_email: contactEmail || '',
      company_name: companyName || '',
      activity_date: new Date().toISOString(),
      notes: notes || `Call to ${toNumber || 'unknown'}${callSid ? ` (SID: ${callSid})` : ''}`,
      duration_minutes: durationMinutes,
      hubspot_synced: false
    });

    // Sync to HubSpot
    const hsToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');

    // Find or create contact in HubSpot
    let contactId = null;
    if (contactEmail || contactName) {
      if (contactEmail) {
        const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: contactEmail }] }],
            limit: 1
          })
        });
        const searchData = await searchRes.json();
        if (searchData.results?.length > 0) {
          contactId = searchData.results[0].id;
        }
      }

      if (!contactId) {
        const nameParts = (contactName || '').split(' ');
        const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: {
              firstname: nameParts[0] || 'Unknown',
              lastname: nameParts.slice(1).join(' ') || '',
              email: contactEmail || '',
              phone: toNumber || ''
            }
          })
        });
        const createData = await createRes.json();
        if (createData.id) contactId = createData.id;
      }
    }

    // Find or create company
    let companyId = null;
    if (companyName) {
      const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'name', operator: 'EQ', value: companyName }] }],
          limit: 1
        })
      });
      const searchData = await searchRes.json();
      if (searchData.results?.length > 0) {
        companyId = searchData.results[0].id;
      } else {
        const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties: { name: companyName } })
        });
        const createData = await createRes.json();
        if (createData.id) companyId = createData.id;
      }
    }

    // Log call engagement in HubSpot
    const engagementBody = {
      engagement: {
        type: 'CALL',
        timestamp: Date.now()
      },
      associations: {
        contactIds: contactId ? [contactId] : [],
        companyIds: companyId ? [companyId] : []
      },
      metadata: {
        body: notes || `Outbound call to ${toNumber}`,
        toNumber: toNumber || '',
        durationMilliseconds: (durationSeconds || 0) * 1000,
        status: 'COMPLETED',
        direction: 'OUTBOUND'
      }
    };

    const engRes = await fetch('https://api.hubapi.com/crm/v3/objects/engagements', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(engagementBody)
    });

    let engagementId = null;
    if (engRes.ok) {
      const engData = await engRes.json();
      engagementId = engData.id;
      await base44.asServiceRole.entities.ActivityLog.update(activity.id, {
        hubspot_synced: true,
        hubspot_engagement_id: engagementId
      });
    }

    return Response.json({ success: true, activityId: activity.id, engagementId });

  } catch (error) {
    console.error('Log call activity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});