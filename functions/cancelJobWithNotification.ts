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

    // Remove contractor from job immediately
    await base44.asServiceRole.entities.Job.update(jobId, {
      booked_by: null,
      booked_by_name: null
    });

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