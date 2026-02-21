import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query } = await req.json();
    
    if (!query || query.trim().length < 2) {
      return Response.json({ contacts: [] });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');
    
    // Search contacts and companies in HubSpot
    const searchUrl = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
    
    const searchBody = {
      query: query,
      limit: 10,
      properties: ['firstname', 'lastname', 'email']
    };

    const contactResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchBody)
    });

    const contactData = await contactResponse.json();
    
    // Format results
    const contacts = contactData.results?.map(result => ({
      id: result.id,
      email: result.properties.email,
      firstname: result.properties.firstname,
      lastname: result.properties.lastname,
      type: 'contact'
    })) || [];

    return Response.json({ contacts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});