import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const applicationId = url.searchParams.get('applicationId') ||
      (await req.json().catch(() => ({}))).applicationId;

    if (!applicationId) {
      return Response.json({ error: 'applicationId is required' }, { status: 400 });
    }

    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    if (!app) {
      return Response.json({ error: 'Application not found' }, { status: 404 });
    }

    // Build a privacy-safe display name: first name + last initial
    const parts = (app.full_name || '').trim().split(/\s+/).filter(Boolean);
    let display_name = app.full_name || '';
    if (parts.length === 1) {
      display_name = parts[0];
    } else if (parts.length > 1) {
      const first = parts[0];
      const lastInitial = parts[parts.length - 1][0] || '';
      display_name = `${first} ${lastInitial.toUpperCase()}.`;
    }

    return Response.json({
      display_name,
      photos: Array.isArray(app.picture_samples) ? app.picture_samples : [],
    });
  } catch (error) {
    console.error('getApplicationPreview error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});