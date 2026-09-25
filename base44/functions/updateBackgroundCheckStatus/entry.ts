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
    let partner = users && users[0];
    let pendingSignup = null;
    if (!partner) {
      const pending = await base44.asServiceRole.entities.PendingSignup.filter({ email });
      pendingSignup = pending && pending[0];
      if (pendingSignup) {
        partner = { id: null, email: pendingSignup.email, full_name: pendingSignup.full_name, phone_number: pendingSignup.phone_number };
      }
    }
    if (!partner) return Response.json({ error: 'User not found' }, { status: 404 });

    const nowIso = new Date().toISOString();
    const updateFields = {
      background_check_status: status,
      background_check_completed_at: nowIso,
    };
    if (partner.id) {
      await base44.asServiceRole.entities.User.update(partner.id, updateFields);
    } else if (pendingSignup) {
      await base44.asServiceRole.entities.PendingSignup.update(pendingSignup.id, updateFields);
    }

    let outcome = null;
    if (status === 'failed') {
      outcome = await processBackgroundCheckFailure(base44, partner);
    } else {
      if (partner.id) {
        await base44.asServiceRole.entities.User.update(partner.id, { background_check_pending_job_id: null });
      } else if (pendingSignup) {
        await base44.asServiceRole.entities.PendingSignup.update(pendingSignup.id, { background_check_pending_job_id: null });
      }
    }

    return Response.json({ success: true, status, outcome });
  } catch (error) {
    console.error('updateBackgroundCheckStatus error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});