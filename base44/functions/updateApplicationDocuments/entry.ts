import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const applicationId = (body.applicationId || '').trim();
    const fullName = (body.fullName || '').trim();
    const addressPrefix = (body.addressPrefix || '').trim().slice(0, 4);

    if (!applicationId || !fullName || !addressPrefix) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    if (!app) {
      return Response.json({ error: 'Application not found' }, { status: 404 });
    }

    // Re-verify identity before allowing any update
    const nameMatch = (app.full_name || '').trim().toLowerCase() === fullName.toLowerCase();
    const addressMatch = (app.address || '').trim().toLowerCase().startsWith(addressPrefix.toLowerCase());
    if (!nameMatch || !addressMatch) {
      return Response.json({ error: 'Verification failed' }, { status: 403 });
    }

    const update = {};
    if (Array.isArray(body.video_samples)) update.video_samples = body.video_samples;
    if (Array.isArray(body.picture_samples)) update.picture_samples = body.picture_samples;
    if (Array.isArray(body.documents)) update.documents = body.documents;

    await base44.asServiceRole.entities.JobApplication.update(applicationId, update);

    return Response.json({ success: true });

  } catch (error) {
    console.error('updateApplicationDocuments error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});