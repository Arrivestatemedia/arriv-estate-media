import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get all completed jobs
    const completedJobs = await base44.asServiceRole.entities.Job.filter({ 
      status: 'completed'
    });

    // Archive completed jobs by changing status to 'archived'
    const updatePromises = completedJobs.map(job => 
      base44.asServiceRole.entities.Job.update(job.id, { status: 'archived' })
    );

    await Promise.all(updatePromises);

    return Response.json({ 
      success: true, 
      message: `Archived ${completedJobs.length} completed jobs` 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});