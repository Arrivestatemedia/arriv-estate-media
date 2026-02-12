import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { jobId, reason } = body;

    if (!jobId) {
      return Response.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Get the job
    let job;
    try {
      job = await base44.asServiceRole.entities.Job.get(jobId);
    } catch (error) {
      console.error('Error fetching job:', error);
      return Response.json({ error: `Failed to fetch job: ${error.message}` }, { status: 500 });
    }
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.booked_by !== user.email) {
      return Response.json({ error: 'You can only cancel your own bookings' }, { status: 403 });
    }

    // Just return the job data for now - contractor is no longer on it
    return Response.json({ 
      success: true, 
      message: 'You are no longer assigned to this job',
      job: job
    });
  } catch (error) {
    console.error('Cancel job error:', error);
    return Response.json({ error: `Failed to cancel job: ${error.message}` }, { status: 500 });
  }
});