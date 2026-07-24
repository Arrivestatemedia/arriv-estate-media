import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processBackgroundCheckFailure } from '../../shared/backgroundCheck.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret');
    const expectedSecret = Deno.env.get('CHECKR_WEBHOOK_SECRET');
    if (!expectedSecret || secret !== expectedSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const objectType = body.object || (body.type ? String(body.type).split('.')[0] : null);
    const candidateId = body.candidate_id;
    const status = body.status;
    const reportId = body.id;

    // Only report results matter for the pass/fail decision.
    if (objectType !== 'report' || !candidateId) {
      return Response.json({ received: true, ignored: true });
    }

    const partners = await base44.asServiceRole.entities.User.filter({ checkr_candidate_id: candidateId });
    const partner = partners && partners[0];
    if (!partner) {
      return Response.json({ received: true, partnerNotFound: true });
    }

    const nowIso = new Date().toISOString();

    if (status === 'clear') {
      await base44.asServiceRole.entities.User.update(partner.id, {
        background_check_status: 'clear',
        background_check_completed_at: nowIso,
        checkr_report_id: reportId || partner.checkr_report_id,
        background_check_pending_job_id: null,
      });
      return Response.json({ received: true, result: 'clear' });
    }

    if (status === 'consider' || status === 'suspended') {
      await base44.asServiceRole.entities.User.update(partner.id, {
        background_check_status: 'failed',
        background_check_completed_at: nowIso,
        checkr_report_id: reportId || partner.checkr_report_id,
      });
      const outcome = await processBackgroundCheckFailure(base44, partner);
      return Response.json({ received: true, result: 'failed', ...outcome });
    }

    // Any other status (pending, etc.) — just record the report id.
    if (reportId) {
      await base44.asServiceRole.entities.User.update(partner.id, { checkr_report_id: reportId });
    }
    return Response.json({ received: true, result: status });
  } catch (error) {
    console.error('handleCheckrWebhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});