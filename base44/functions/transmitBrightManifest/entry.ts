import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import { BRIGHT_MAX_ATTEMPTS } from '../../shared/brightMlsClient.ts';
import { buildBrightManifestFor, submitBrightManifest } from '../../shared/brightSubmission.ts';

/**
 * transmitBrightManifest
 * The only path to Bright's Media Sync API. Administrator-only, always.
 *
 * Modes
 *   preview  — builds the exact body that would be POSTed (including signed media URLs) and
 *              returns it with a field-by-field source map. No network call.
 *   submit   — POSTs the body to Bright's /manifest endpoint and records the outcome.
 *   retry_due — re-attempts only the requests whose last attempt was a retryable failure and whose
 *               backoff has elapsed. Safe to schedule.
 *
 * Live customer publishing is untouched: a customer request still reaches this only if the Bright
 * route is enabled AND certified in the provider registry, and certification is never written here.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { requestId, mode = 'preview' } = body || {};

    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: 403 });

    if (mode === 'retry_due') {
      const rows = await base44.asServiceRole.entities.MlsUploadRequest.filter(
        { provider: 'bright_mls' },
        { sort: '-created_date', limit: 200 },
      );
      const nowMs = Date.now();
      const due = (rows?.items || rows || []).filter((r: any) =>
        r.bright_next_retry_at
        && new Date(r.bright_next_retry_at).getTime() <= nowMs
        && !r.bright_manifest_id
        && !r.bright_needs_verification
        && Number(r.bright_submission_attempts || 0) < BRIGHT_MAX_ATTEMPTS,
      ).slice(0, 10);

      const results = [];
      for (const r of due) {
        results.push(await submitBrightManifest(base44, r));
      }
      return Response.json({ success: true, attempted: results.length, results });
    }

    if (!requestId) return Response.json({ error: 'requestId is required' }, { status: 400 });

    const rows = await base44.asServiceRole.entities.MlsUploadRequest.filter({ request_id: requestId }, undefined, 1);
    const request = rows?.[0];
    if (!request) return Response.json({ error: 'MLS request not found' }, { status: 404 });
    if (request.provider !== 'bright_mls') {
      return Response.json({ error: 'This request is not routed to Bright MLS' }, { status: 409 });
    }
    if (!request.provider_manifest) {
      return Response.json({ error: 'This request has no Bright manifest to send' }, { status: 409 });
    }

    if (mode === 'preview') {
      const built = await buildBrightManifestFor(base44, request);
      let endpointHost = '';
      try { endpointHost = new URL(built.config.endpoint).host; } catch { endpointHost = ''; }
      return Response.json({
        success: true,
        configured: built.missing.length === 0,
        missing: built.missing,
        endpoint_host: endpointHost,
        payload: built.body,
        field_map: built.field_map,
        gaps: built.gaps,
        assumptions: built.assumptions,
        skipped: built.skipped,
        validation: built.validation,
        already_sent: !!request.bright_manifest_id,
        manifest_id: request.bright_manifest_id || null,
        import_url: request.bright_import_url || null,
        link_expires_at: request.bright_link_expires_at || null,
        link_expires_at_if_sent_now: built.link_expires_at,
        superseded_manifest_ids: request.bright_superseded_manifest_ids || [],
        regeneration_count: Number(request.bright_regeneration_count || 0),
        resend_authorized: !!request.bright_resend_authorized_at,
      });
    }

    if (mode === 'submit') {
      const result = await submitBrightManifest(base44, request, body?.confirmedNotReceived === true);
      const ok = result.outcome === 'accepted' || result.outcome === 'already_sent';
      return Response.json({ success: ok, ...result, error: ok ? undefined : result.message }, { status: ok ? 200 : 502 });
    }

    /**
     * A manifest Bright already accepted cannot simply be sent again: the media links inside it
     * expire 14 days after it was built, and a second manifest is billable. This mode is the only
     * way to obtain a replacement, and it deliberately does not send anything — it records who
     * authorized it, why, and how many replacements this request has had. The actual send still
     * goes through 'submit', which then builds brand-new links.
     */
    if (mode === 'authorize_resend') {
      if (!request.bright_manifest_id) {
        return Response.json(
          { error: 'Bright has not accepted a manifest for this request yet, so there is no accepted manifest to replace.' },
          { status: 409 },
        );
      }
      const reason = String(body?.reason || '').trim();
      if (reason.length < 10) {
        return Response.json(
          { error: 'Record why a replacement manifest is needed (at least 10 characters) before authorizing it.' },
          { status: 400 },
        );
      }
      const authorizedAt = new Date().toISOString();
      const updated = await base44.asServiceRole.entities.MlsUploadRequest.update(request.id, {
        bright_resend_authorized_at: authorizedAt,
        bright_resend_authorized_by: auth.actorEmail || auth.actor || 'admin',
        bright_resend_reason: reason,
        bright_regeneration_count: Number(request.bright_regeneration_count || 0) + 1,
      });
      return Response.json({
        success: true,
        authorized: true,
        previous_manifest_id: request.bright_manifest_id,
        regeneration_count: Number(request.bright_regeneration_count || 0) + 1,
        note: 'A replacement manifest is a second billable manifest at Bright. Nothing has been sent: the previous manifestId is kept in the record and the replacement is sent only when you confirm the send.',
        request: updated,
      });
    }

    return Response.json(
      { error: "Unknown mode. Use 'preview', 'submit', 'authorize_resend' or 'retry_due'." },
      { status: 400 },
    );
  } catch (error: any) {
    console.error('transmitBrightManifest error:', error);
    return Response.json({ error: error?.message || 'The Bright manifest could not be sent' }, { status: 500 });
  }
});