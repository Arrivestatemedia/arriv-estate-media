import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * confirmFootageUpload
 * Called by media partners to confirm they've uploaded their footage to Google Drive.
 * Uses asServiceRole to bypass RLS (Job updates are admin-only, but media partners
 * need to confirm their own uploads).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId } = await req.json();

    if (!jobId) {
      return Response.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    await base44.asServiceRole.entities.Job.update(jobId, {
      footage_uploaded: true,
      status: 'completed',
      source_upload_status: 'complete'
    });

    return Response.json({
      success: true,
      job_id: jobId,
      footage_uploaded: true,
      status: 'completed'
    });
  } catch (error) {
    console.error('Error confirming footage upload:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});