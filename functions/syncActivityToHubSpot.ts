import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { activityId } = await req.json();
    if (!activityId) {
      return Response.json({ error: 'activityId required' }, { status: 400 });
    }

    // Fetch activity
    const activities = await base44.asServiceRole.entities.ActivityLog.filter({ id: activityId });
    const activity = activities[0];
    if (!activity) {
      return Response.json({ error: 'Activity not found' }, { status: 404 });
    }

    // Get HubSpot token
    const hsToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');

    // Find existing contact by email (DO NOT CREATE)
    let contactId = null;
    if (activity.contact_email) {
      const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator: 'EQ',
              value: activity.contact_email
            }]
          }],
          limit: 1
        })
      });
      const searchData = await searchRes.json();
      if (searchData.results && searchData.results.length > 0) {
        contactId = searchData.results[0].id;
      }
    }
    // If no email match and contact_name provided, try phone match
    if (!contactId && activity.contact_phone) {
      const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterGroups: [{
            filters: [{
              propertyName: 'phone',
              operator: 'EQ',
              value: activity.contact_phone
            }]
          }],
          limit: 1
        })
      });
      const searchData = await searchRes.json();
      if (searchData.results && searchData.results.length > 0) {
        contactId = searchData.results[0].id;
      }
    }

    // Find existing company by name (DO NOT CREATE)
    let companyId = null;
    if (activity.company_name) {
      const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterGroups: [{
            filters: [{
              propertyName: 'name',
              operator: 'EQ',
              value: activity.company_name
            }]
          }],
          limit: 1
        })
      });
      const searchData = await searchRes.json();
      if (searchData.results && searchData.results.length > 0) {
        companyId = searchData.results[0].id;
      }
    }

    // Create engagement (activity) on timeline
    const engagementBody = {
      engagement: {
        type: activity.activity_type.toUpperCase(),
        timestamp: new Date(activity.activity_date).getTime()
      },
      associations: {
        contactIds: contactId ? [contactId] : [],
        companyIds: companyId ? [companyId] : []
      },
      metadata: {
        body: activity.notes,
        subject: `${activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1)}: ${activity.contact_name || activity.company_name || 'Unknown'}`,
        duration: activity.duration_minutes || 0
      }
    };

    const engagementRes = await fetch('https://api.hubapi.com/crm/v3/objects/engagements', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(engagementBody)
    });

    if (!engagementRes.ok) {
      const errData = await engagementRes.json();
      throw new Error(`HubSpot engagement failed: ${JSON.stringify(errData)}`);
    }

    const engagementData = await engagementRes.json();
    const engagementId = engagementData.id;

    // Update activity with sync status
    await base44.asServiceRole.entities.ActivityLog.update(activityId, {
      hubspot_synced: true,
      hubspot_engagement_id: engagementId
    });

    return Response.json({ 
      success: true, 
      engagementId,
      contactId,
      companyId
    });

  } catch (error) {
    console.error('Sync to HubSpot error:', error);
    
    // Update activity with error
    const { activityId } = await req.json();
    if (activityId) {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.ActivityLog.update(activityId, {
        sync_error: error.message
      }).catch(() => {});
    }

    return Response.json({ error: error.message }, { status: 500 });
  }
});