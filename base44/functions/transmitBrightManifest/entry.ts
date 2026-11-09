import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import {
  loadBrightConfig,
  brightConfigComplete,
  buildBrightRequestBody,
  classifyBrightResponse,
  brightImportUrl,
  nextBrightRetryAt,
  BRIGHT_MAX_ATTEMPTS,
} from '../../shared/brightMlsClient.ts';
import { signBrightMediaToken, buildBrightMediaUrl, brightMediaExpiry } from '../../shared/brightMediaUrls.ts';
import { resolveAppUrl } from '../../shared/mlsNotifications.ts';

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

interface BuiltManifest {
  config: ReturnType<typeof loadBrightConfig>['config'];
  missing: string[];
  origin: string;
  body: any;
  field_map: any[];
  gaps: string[];
  assumptions: string[];
  skipped: string[];
}

async function buildFor(base44: any, request: any): Promise<BuiltManifest> {
  const { config, missing } = loadBrightConfig();
  const origin = await resolveAppUrl(base44);

  const mediaUrls: Record<string, string> = {};
  const photos = Array.isArray(request?.provider_manifest?.media?.photos) ? request.provider_manifest.media.photos : [];
  if (config.mediaSigningSecret) {
    const expiresAt = brightMediaExpiry();
    for (const photo of photos) {
      const fileId = String(photo?.drive_file_id || '');
      if (!fileId) continue;
      const token = await signBrightMediaToken(
        { requestId: request.request_id, fileId, expiresAt },
        config.mediaSigningSecret,
      );
      mediaUrls[fileId] = buildBrightMediaUrl(origin, token);
    }
  }

  const built = buildBrightRequestBody({
    storedManifest: request.provider_manifest,
    config,
    mediaUrls,
  });

  const gaps = [...built.gaps];
  if (!config.mediaSigningSecret && photos.length > 0) {
    gaps.unshift('BRIGHT_MLS_MEDIA_SIGNING_SECRET is not set, so no photograph could be given a media link.');
  }

  return {
    config,
    missing,
    origin,
    body: built.body,
    field_map: built.field_map,
    gaps: Array.from(new Set(gaps)),
    assumptions: built.assumptions,
    skipped: built.skipped,
  };
}

async function postManifest(config: any, body: any) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': config.apiKey,
        'x-api-user': config.vendorId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text ? { message: text.slice(0, 500) } : null;
    }
    return { status: res.status, payload };
  } catch (error: any) {
    return {
      status: 0,
      payload: null,
      transportError: error?.name === 'AbortError' ? 'the request timed out' : String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Sends one request's manifest and records exactly what Bright said. */
async function submitFor(base44: any, request: any) {
  if (request?.provider !== 'bright_mls') {
    return { request_id: request?.request_id, outcome: 'rejected', message: 'This request is not routed to Bright.' };
  }
  if (!request?.provider_manifest) {
    return { request_id: request?.request_id, outcome: 'rejected', message: 'This request has no Bright manifest to send.' };
  }
  if (request?.bright_manifest_id) {
    return {
      request_id: request.request_id,
      outcome: 'already_sent',
      manifest_id: request.bright_manifest_id,
      import_url: request.bright_import_url || null,
      message: 'This manifest was already accepted by Bright.',
    };
  }

  const { config, missing } = loadBrightConfig();
  if (missing.length > 0) {
    return { request_id: request.request_id, outcome: 'rejected', message: `Bright is not configured yet: ${missing.join(', ')}.` };
  }
  if (!brightConfigComplete(config)) {
    return { request_id: request.request_id, outcome: 'rejected', message: 'Bright is not configured yet.' };
  }

  const built = await buildFor(base44, request);
  if (!Array.isArray(built.body.listItems) || built.body.listItems.length === 0) {
    return { request_id: request.request_id, outcome: 'rejected', message: 'Nothing sendable: the manifest produced no media items.' };
  }

  const posted = await postManifest(config, built.body);
  const outcome = classifyBrightResponse(posted.status, posted.payload, (posted as any).transportError);

  const now = new Date().toISOString();
  const attempts = Number(request.bright_submission_attempts || 0) + 1;
  const patch: any = {
    bright_submission_attempts: attempts,
    bright_last_attempt_at: now,
    bright_last_status: outcome.status,
    bright_response: {
      outcome: outcome.outcome,
      status: outcome.status,
      message: outcome.message,
      received_at: now,
      body: posted.payload ?? null,
    },
  };

  if (outcome.outcome === 'accepted') {
    patch.bright_manifest_id = outcome.manifestId;
    patch.bright_import_url = brightImportUrl(config.redirectBase, String(outcome.manifestId));
    patch.bright_submitted_at = now;
    patch.bright_last_error = '';
    patch.bright_next_retry_at = null;
    patch.manifest_status = 'transmitted';
  } else if (outcome.outcome === 'retry') {
    patch.bright_last_error = outcome.message;
    patch.bright_next_retry_at = attempts < BRIGHT_MAX_ATTEMPTS ? nextBrightRetryAt(attempts) : null;
  } else {
    patch.bright_last_error = outcome.message;
    patch.bright_next_retry_at = null;
  }

  const updated = await base44.asServiceRole.entities.MlsUploadRequest.update(request.id, patch);

  return {
    request_id: request.request_id,
    outcome: outcome.outcome,
    status: outcome.status,
    manifest_id: outcome.manifestId || null,
    import_url: patch.bright_import_url || null,
    message: outcome.message,
    retry_scheduled_for: patch.bright_next_retry_at || null,
    attempts,
    request: updated,
  };
}

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
        && Number(r.bright_submission_attempts || 0) < BRIGHT_MAX_ATTEMPTS,
      ).slice(0, 10);

      const results = [];
      for (const r of due) {
        results.push(await submitFor(base44, r));
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
      const built = await buildFor(base44, request);
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
        already_sent: !!request.bright_manifest_id,
        manifest_id: request.bright_manifest_id || null,
        import_url: request.bright_import_url || null,
      });
    }

    if (mode === 'submit') {
      const result = await submitFor(base44, request);
      const ok = result.outcome === 'accepted' || result.outcome === 'already_sent';
      return Response.json({ success: ok, ...result, error: ok ? undefined : result.message }, { status: ok ? 200 : 502 });
    }

    return Response.json({ error: "Unknown mode. Use 'preview', 'submit' or 'retry_due'." }, { status: 400 });
  } catch (error: any) {
    console.error('transmitBrightManifest error:', error);
    return Response.json({ error: error?.message || 'The Bright manifest could not be sent' }, { status: 500 });
  }
});