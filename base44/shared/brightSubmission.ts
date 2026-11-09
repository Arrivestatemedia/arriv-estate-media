// brightSubmission.ts
// The one place a Bright Media Sync manifest is built, validated and sent.
//
// Two callers use it and they must never diverge:
//   transmitBrightManifest — the administrator's tool (preview, submit, authorized resend, retries).
//   submitMlsUploadRequest — the customer's "Publish to MLS", which may send only once the Bright
//                            route is enabled AND every certification test has passed.
//
// Every safeguard against a duplicate billable manifest lives here: a request whose manifest Bright
// already accepted is never sent again unless an administrator recorded an authorized replacement,
// and an attempt whose outcome is unknown is never retried automatically.

import {
  loadBrightConfig,
  brightConfigComplete,
  buildBrightRequestBody,
  validateBrightBody,
  classifyBrightResponse,
  brightImportUrl,
  nextBrightRetryAt,
  BRIGHT_MAX_ATTEMPTS,
} from './brightMlsClient.ts';
import { signBrightMediaToken, buildBrightMediaUrl, brightMediaExpiry } from './brightMediaUrls.ts';
import { resolveAppUrl } from './mlsNotifications.ts';

export interface BuiltManifest {
  config: ReturnType<typeof loadBrightConfig>['config'];
  missing: string[];
  origin: string;
  body: any;
  field_map: any[];
  gaps: string[];
  assumptions: string[];
  skipped: string[];
  validation: ReturnType<typeof validateBrightBody>;
  link_expires_at: string;
}

/**
 * One Drive listing, so each manifest item carries the real file modification time rather than the
 * time the manifest happened to be built. A failure here is not fatal: the builder falls back to the
 * manifest's generation time.
 */
async function loadDriveModifiedTimes(base44: any, folderId: string): Promise<Record<string, string>> {
  if (!folderId) return {};
  try {
    const token = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&pageSize=200`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, string> = {};
    for (const file of data?.files || []) map[String(file.id)] = String(file.modifiedTime || '');
    return map;
  } catch {
    return {};
  }
}

export async function buildBrightManifestFor(base44: any, request: any): Promise<BuiltManifest> {
  const { config, missing } = loadBrightConfig();
  const origin = await resolveAppUrl(base44);

  const mediaUrls: Record<string, string> = {};
  const photos = Array.isArray(request?.provider_manifest?.media?.photos) ? request.provider_manifest.media.photos : [];
  // Every build mints fresh links, so this is the moment Bright can start fetching and the moment
  // the clock on those links starts.
  const linkExpiresAt = brightMediaExpiry();
  if (config.mediaSigningSecret) {
    const expiresAt = linkExpiresAt;
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

  const folderId = String(request?.provider_manifest?.source?.delivery_folder_id || '');
  const modifiedTimes = await loadDriveModifiedTimes(base44, folderId);

  const built = buildBrightRequestBody({
    storedManifest: request.provider_manifest,
    config,
    mediaUrls,
    modifiedTimes,
  });

  const gaps = [...built.gaps];
  if (!config.mediaSigningSecret && photos.length > 0) {
    gaps.unshift('BRIGHT_MLS_MEDIA_SIGNING_SECRET is not set, so no photograph could be given a media link.');
  }
  if (photos.length > 0 && Object.keys(modifiedTimes).length === 0) {
    gaps.push('File modification times could not be read from Drive, so lastModified uses the manifest generation time.');
  }

  const validation = validateBrightBody(built.body);

  return {
    config,
    missing,
    origin,
    body: built.body,
    field_map: built.field_map,
    gaps: Array.from(new Set(gaps)),
    assumptions: built.assumptions,
    skipped: built.skipped,
    validation,
    link_expires_at: new Date(linkExpiresAt).toISOString(),
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
export async function submitBrightManifest(base44: any, request: any, confirmedNotReceived = false) {
  if (request?.provider !== 'bright_mls') {
    return { request_id: request?.request_id, outcome: 'rejected', message: 'This request is not routed to Bright.' };
  }
  if (!request?.provider_manifest) {
    return { request_id: request?.request_id, outcome: 'rejected', message: 'This request has no Bright manifest to send.' };
  }
  // An accepted manifest is final. The only way past this is an administrator authorizing a
  // replacement (authorize_resend), which is recorded because it bills a second manifest.
  const resendAuthorized = !!request?.bright_resend_authorized_at;
  if (request?.bright_manifest_id && !resendAuthorized) {
    return {
      request_id: request.request_id,
      outcome: 'already_sent',
      manifest_id: request.bright_manifest_id,
      import_url: request.bright_import_url || null,
      message: 'This manifest was already accepted by Bright.',
      request,
    };
  }

  // A previous attempt may have created a billable manifest before it failed. Never send again
  // until a person has looked in Bright and confirmed the manifest is not there.
  if (request?.bright_needs_verification && !confirmedNotReceived && !resendAuthorized) {
    return {
      request_id: request.request_id,
      outcome: 'needs_verification',
      message: 'Bright may already have this manifest from an earlier attempt. Check Bright, then resend only if it is not there.',
      request,
    };
  }

  const { config, missing } = loadBrightConfig();
  if (missing.length > 0) {
    return { request_id: request.request_id, outcome: 'rejected', message: `Bright is not configured yet: ${missing.join(', ')}.`, request };
  }
  if (!brightConfigComplete(config)) {
    return { request_id: request.request_id, outcome: 'rejected', message: 'Bright is not configured yet.', request };
  }

  const built = await buildBrightManifestFor(base44, request);

  // A body Bright would reject is never POSTed: a rejected attempt still counts against the vendor
  // account, so the documented contract is enforced locally first.
  if (built.validation.blocking.length > 0) {
    return {
      request_id: request.request_id,
      outcome: 'invalid',
      message: `Not sent: the manifest does not yet match Bright's documented contract. ${built.validation.blocking.join(' ')}`,
      validation: built.validation,
      request,
    };
  }
  if (!Array.isArray(built.body.listItems) || built.body.listItems.length === 0) {
    return { request_id: request.request_id, outcome: 'rejected', message: 'Nothing sendable: the manifest produced no media items.', request };
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
    patch.bright_needs_verification = false;
    patch.manifest_status = 'transmitted';
    patch.bright_link_expires_at = built.link_expires_at;
    // The authorization is spent the moment the replacement is accepted, so it can never fund a
    // third send on its own.
    patch.bright_resend_authorized_at = null;
    patch.bright_resend_authorized_by = '';
    patch.bright_resend_reason = '';
    if (request.bright_manifest_id) {
      patch.bright_superseded_manifest_ids = [
        ...(Array.isArray(request.bright_superseded_manifest_ids) ? request.bright_superseded_manifest_ids : []),
        request.bright_manifest_id,
      ];
    }
  } else if (outcome.outcome === 'retry') {
    // 429 only: Bright definitely created nothing, so a scheduled retry cannot duplicate.
    patch.bright_last_error = outcome.message;
    patch.bright_next_retry_at = attempts < BRIGHT_MAX_ATTEMPTS ? nextBrightRetryAt(attempts) : null;
  } else if (outcome.outcome === 'ambiguous') {
    patch.bright_last_error = `${outcome.message} Nothing was retried automatically: check Bright for this property's media, then resend only if it is not there.`;
    patch.bright_next_retry_at = null;
    patch.bright_needs_verification = true;
  } else {
    patch.bright_last_error = outcome.message;
    patch.bright_next_retry_at = null;
    patch.bright_needs_verification = false;
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