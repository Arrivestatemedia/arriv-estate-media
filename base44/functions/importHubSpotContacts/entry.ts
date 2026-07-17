import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');

    // Fetch all existing local contacts to dedup by hubspot_id or email
    const existing = await base44.asServiceRole.entities.Contact.list('-created_date', 5000);
    const existingByHubspotId = {};
    const existingByEmail = {};
    existing.forEach(c => {
      if (c.hubspot_id) existingByHubspotId[c.hubspot_id] = c;
      if (c.email) existingByEmail[c.email.toLowerCase()] = c;
    });

    const properties = ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle', 'hs_lead_status', 'lifecyclestage'];
    let after = null;
    let imported = 0;
    let updated = 0;
    let totalFetched = 0;
    let hasMore = true;

    while (hasMore) {
      let url = `https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=${properties.join(',')}`;
      if (after) url += `&after=${after}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const data = await res.json();

      if (!res.ok) {
        return Response.json({ error: `HubSpot API error: ${data.message || 'Unknown'}` }, { status: 500 });
      }

      const results = data.results || [];
      totalFetched += results.length;

      // Build batch of contacts to create or update
      const toCreate = [];
      const toUpdate = [];

      for (const r of results) {
        const p = r.properties || {};
        const email = (p.email || '').toLowerCase().trim();
        const hubspotId = r.id;

        const localData = {
          firstname: p.firstname || '',
          lastname: p.lastname || '',
          email: p.email || '',
          phone: p.phone || '',
          company: p.company || '',
          job_title: p.jobtitle || '',
          lead_status: p.hs_lead_status || '',
          lifecycle_stage: p.lifecyclestage || '',
          hubspot_id: hubspotId
        };

        // Dedup by hubspot_id first, then email
        if (hubspotId && existingByHubspotId[hubspotId]) {
          toUpdate.push({ id: existingByHubspotId[hubspotId].id, ...localData });
        } else if (email && existingByEmail[email]) {
          // Update with hubspot_id if missing
          toUpdate.push({ id: existingByEmail[email].id, ...localData });
        } else {
          toCreate.push(localData);
          if (hubspotId) existingByHubspotId[hubspotId] = true;
          if (email) existingByEmail[email] = true;
        }
      }

      // Bulk create new contacts
      if (toCreate.length > 0) {
        await base44.asServiceRole.entities.Contact.bulkCreate(toCreate);
        imported += toCreate.length;
      }

      // Bulk update existing contacts (fill in missing hubspot_id / fields)
      if (toUpdate.length > 0) {
        await base44.asServiceRole.entities.Contact.bulkUpdate(toUpdate);
        updated += toUpdate.length;
      }

      // Pagination
      if (data.paging && data.paging.next && data.paging.next.after) {
        after = data.paging.next.after;
        hasMore = true;
      } else {
        hasMore = false;
      }
    }

    return Response.json({
      success: true,
      totalFetched,
      imported,
      updated
    });
  } catch (error) {
    console.error('Import HubSpot contacts error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});