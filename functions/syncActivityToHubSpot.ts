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

    // Find or create contact
    let contactId = null;
    if (activity.contact_email || activity.contact_name) {
      const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator: 'EQ',
              value: activity.contact_email || 'unknown@example.com'
            }]
          }],
          limit: 1
        })
      });
      const searchData = await searchRes.json();
      
      if (searchData.results && searchData.results.length > 0) {
        contactId = searchData.results[0].id;
      } else {
        // Create new contact
        const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: {
              firstname: activity.contact_name ? activity.contact_name.split(' ')[0] : 'Unknown',
              lastname: activity.contact_name ? activity.contact_name.split(' ').slice(1).join(' ') : '',
              email: activity.contact_email || ''
            }
          })
        });
        const createData = await createRes.json();
        if (createData.id) {
          contactId = createData.id;
        }
      }
    }

    // Find or create company
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
      } else {
        // Create new company
        const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hsToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: {
              name: activity.company_name
            }
          })
        });
        const createData = await createRes.json();
        if (createData.id) {
          companyId = createData.id;
        }
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