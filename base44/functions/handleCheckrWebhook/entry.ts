import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processBackgroundCheckFailure } from '../../shared/backgroundCheck.ts';
import { applyCheckrResultToOrientation } from '../../shared/orientationEngine.ts';
import { auditLog } from '../../shared/securityAudit.ts';

/**
 * Checkr webhook handler.
 *
 * Round 1 found authentication via a shared secret in the URL query parameter
 * (?secret=X) — query params are logged in access logs, browser history, and
 * proxy logs. No timestamp or nonce — replay attacks possible.
 *
 * Remediation: Move the secret to the X-Checkr-Webhook-Secret header.
 * Checkr does not provide a native webhook signature, so we use a shared secret
 * in a custom header (not a query parameter).
 *
 * Backwards compatibility: If the header is absent, fall back to the query
 * parameter for a transition period, but log a deprecation warning.
 */
async function verifyCheckrSecret(req: Request, url: URL): Promise<{ valid: boolean; deprecated: boolean }> {
  const expectedSecret = Deno.env.get('CHECKR_WEBHOOK_SECRET');
  if (!expectedSecret) {
    return { valid: false, deprecated: false };
  }

  // Preferred: header-based secret
  const headerSecret = req.headers.get('X-Checkr-Webhook-Secret');
  if (headerSecret) {
    if (expectedSecret.length !== headerSecret.length) return { valid: false, deprecated: false };
    let result = 0;
    for (let i = 0; i < expectedSecret.length; i++) {
      result |= expectedSecret.charCodeAt(i) ^ headerSecret.charCodeAt(i);
    }
    return { valid: result === 0, deprecated: false };
  }

  // Deprecated fallback: query parameter (for transition period)
  const querySecret = url.searchParams.get('secret');
  if (querySecret) {
    if (expectedSecret.length !== querySecret.length) return { valid: false, deprecated: true };
    let result = 0;
    for (let i = 0; i < expectedSecret.length; i++) {
      result |= expectedSecret.charCodeAt(i) ^ querySecret.charCodeAt(i);
    }
    return { valid: result === 0, deprecated: true };
  }

  return { valid: false, deprecated: false };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const url = new URL(req.url);
    const check = await verifyCheckrSecret(req, url);
    if (!check.valid) {
      await auditLog(base44, req, {
        event_type: 'webhook_verification_failure',
        actor_type: 'webhook',
        action: 'handleCheckrWebhook',
        result: 'denied',
        reason: 'invalid_checkr_secret',
      });
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (check.deprecated) {
      console.warn('Checkr webhook using deprecated query-parameter secret — migrate to X-Checkr-Webhook-Secret header');
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
      // Not a media partner — try a sales rep (SalesOrientation stores checkr_candidate_id).
      const oResult = await applyCheckrResultToOrientation(base44, { candidateId, status, reportId });
      return Response.json({ received: true, partnerNotFound: !oResult, salesOrientation: oResult });
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