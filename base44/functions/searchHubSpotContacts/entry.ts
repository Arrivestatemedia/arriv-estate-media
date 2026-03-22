import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { query } = await req.json();
    
    if (!query || query.trim().length < 2) {
      return Response.json({ contacts: [] });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');
    
    const searchBody = {
      query: query.trim(),
      limit: 10,
      properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle', 'hs_lead_status', 'lifecyclestage']
    };

    const contactResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchBody)
    });

    const contactData = await contactResponse.json();
    
    const contacts = contactData.results?.map(result => ({
      id: result.id,
      email: result.properties.email || '',
      firstname: result.properties.firstname || '',
      lastname: result.properties.lastname || '',
      phone: result.properties.phone || '',
      company: result.properties.company || '',
      jobtitle: result.properties.jobtitle || '',
      lead_status: result.properties.hs_lead_status || '',
      lifecycle_stage: result.properties.lifecyclestage || ''
    })) || [];

    return Response.json({ contacts });
  } catch (error) {
    console.error('Search HubSpot error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});