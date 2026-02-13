import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { jobId, reason } = body;

    if (!jobId) {
      return Response.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Get the job
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!job.booked_by) {
      return Response.json({ error: 'This job is not currently booked' }, { status: 400 });
    }

    // Check if there's a backup contractor
    if (job.backup_booked_by) {
      // Assign backup to main position
      await base44.asServiceRole.entities.Job.update(jobId, {
        booked_by: job.backup_booked_by,
        booked_by_name: job.backup_booked_by_name,
        booked_by_phone: job.backup_booked_by_phone,
        backup_booked_by: null,
        backup_booked_by_name: null,
        backup_booked_by_phone: null
      });
    } else {
      // No backup - set job back to open
      await base44.asServiceRole.entities.Job.update(jobId, {
        status: 'open',
        booked_by: null,
        booked_by_name: null,
        booked_by_phone: null,
        backup_booked_by: null,
        backup_booked_by_name: null,
        backup_booked_by_phone: null
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'You are no longer assigned to this job'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Cancel job error:', error);
    return Response.json({ error: `Failed to cancel job: ${error.message}` }, { status: 500 });
  }
});