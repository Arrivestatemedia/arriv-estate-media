import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Sync Bradley Burke to HubSpot
    const result = await base44.functions.invoke('updateHubSpotContact', {
      email: 'BradCBurke@gmail.com',
      firstName: 'Bradley',
      lastName: 'Burke',
      company: 'Arriv Estate Media',
      createIfNotFound: true
    });

    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});