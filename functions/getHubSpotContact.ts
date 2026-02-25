import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');

    // Search for contact by email
    const searchResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
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
            value: email
          }]
        }],
        properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'lifecyclestage', 'hs_lead_status', 'hubspotsales_notes', 'address', 'city', 'state', 'zip']
      })
    });

    const searchData = await searchResponse.json();

    if (!searchData.results || searchData.results.length === 0) {
      return Response.json({ contact: null });
    }

    const contact = searchData.results[0];
    const properties = contact.properties;

    return Response.json({
      contact: {
        id: contact.id,
        firstname: properties.firstname,
        lastname: properties.lastname,
        email: properties.email,
        phone: properties.phone,
        company: properties.company,
        lifecyclestage: properties.lifecyclestage,
        leadstatus: properties.hs_lead_status,
        notes: properties.hubspotsales_notes,
        address: properties.address,
        city: properties.city,
        state: properties.state,
        zip: properties.zip,
        hubspotUrl: `https://app.hubspot.com/contacts/default/contact/${contact.id}`
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});