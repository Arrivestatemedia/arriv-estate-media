import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const fullName = (body.fullName || '').trim();
    const addressPrefix = (body.addressPrefix || '').trim().slice(0, 4);

    if (!fullName || !addressPrefix) {
      return Response.json({ error: 'Name and the first 4 digits of your street address are required' }, { status: 400 });
    }

    const name = fullName.toLowerCase();
    const prefix = addressPrefix.toLowerCase();

    const apps = await base44.asServiceRole.entities.JobApplication.filter({}, '-created_date', 1000);
    const matches = apps.filter(a =>
      (a.full_name || '').trim().toLowerCase() === name &&
      (a.address || '').trim().toLowerCase().startsWith(prefix)
    );

    if (!matches.length) {
      return Response.json({ notFound: true });
    }

    // Most recent match (filter already sorted by created_date desc)
    return Response.json({ application: matches[0] });

  } catch (error) {
    console.error('lookupApplication error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});