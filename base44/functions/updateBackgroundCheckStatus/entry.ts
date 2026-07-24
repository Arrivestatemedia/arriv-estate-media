import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processBackgroundCheckFailure } from '../../shared/backgroundCheck.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { email, status } = body;
    if (!email || !['clear', 'failed'].includes(status)) {
      return Response.json({ error: 'email and status (clear|failed) are required' }, { status: 400 });
    }

    const users = await base44.asServiceRole.entities.User.filter({ email });
    const partner = users && users[0];
    if (!partner) return Response.json({ error: 'User not found' }, { status: 404 });

    const nowIso = new Date().toISOString();
    await base44.asServiceRole.entities.User.update(partner.id, {
      background_check_status: status,
      background_check_completed_at: nowIso,
    });

    let outcome = null;
    if (status === 'failed') {
      outcome = await processBackgroundCheckFailure(base44, partner);
    } else {
      await base44.asServiceRole.entities.User.update(partner.id, { background_check_pending_job_id: null });
    }

    return Response.json({ success: true, status, outcome });
  } catch (error) {
    console.error('updateBackgroundCheckStatus error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});