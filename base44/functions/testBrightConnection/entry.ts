import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import { loadBrightConfig, brightConfigComplete } from '../../shared/brightMlsClient.ts';
import {
  signBrightMediaToken,
  verifyBrightMediaToken,
  BRIGHT_MEDIA_URL_TTL_HOURS,
} from '../../shared/brightMediaUrls.ts';

/**
 * testBrightConnection
 * Administrator-only readiness check for the Bright Media Sync integration.
 *
 * It verifies everything that CAN be verified without talking to Bright: every required secret is
 * present, the endpoint and import-link base are usable https URLs, and the media signing secret
 * really signs and verifies a link. It never POSTs a manifest.
 *
 * What it cannot do is authenticate. Bright documents no authentication or ping endpoint that can
 * be called without submitting a manifest, so the credentials stay unproven until the first
 * authorized submission. That is reported plainly rather than faked with a throwaway manifest,
 * because a throwaway manifest would be a billable submission.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: 403 });

    const { config, missing } = loadBrightConfig();
    const checks: Array<{ id: string; label: string; status: 'pass' | 'fail'; detail: string }> = [];
    const record = (id: string, label: string, ok: boolean, detail: string) => {
      checks.push({ id, label, status: ok ? 'pass' : 'fail', detail });
    };

    record(
      'api_key',
      'Bright API key present',
      !!config.apiKey,
      config.apiKey ? 'BRIGHT_MLS_API_KEY is set.' : 'BRIGHT_MLS_API_KEY is not set.',
    );
    record(
      'vendor_id',
      'Vendor / API user ID present',
      !!config.vendorId,
      config.vendorId
        ? 'BRIGHT_MLS_VENDOR_ID is set. It is sent as x-api-user, so it must match the API user Bright issued the key to.'
        : 'BRIGHT_MLS_VENDOR_ID is not set.',
    );
    record(
      'vendor_name',
      'Vendor name present',
      !!config.vendorName,
      config.vendorName ? 'BRIGHT_MLS_VENDOR_NAME is set.' : 'BRIGHT_MLS_VENDOR_NAME is not set.',
    );

    let endpointHost = '';
    let endpointSecure = false;
    try {
      const parsed = new URL(config.endpoint);
      endpointHost = parsed.host;
      endpointSecure = parsed.protocol === 'https:';
    } catch { /* unparseable */ }
    record(
      'endpoint',
      'Manifest endpoint',
      !!endpointHost && endpointSecure,
      endpointHost
        ? `${endpointSecure ? 'https' : 'NOT https'}://${endpointHost}`
        : 'BRIGHT_MLS_MANIFEST_ENDPOINT is not a usable URL.',
    );

    let redirectHost = '';
    let redirectSecure = false;
    try {
      const parsed = new URL(config.redirectBase);
      redirectHost = parsed.host;
      redirectSecure = parsed.protocol === 'https:';
    } catch { /* unparseable */ }
    record(
      'redirect_base',
      'Import link base',
      !!redirectHost && redirectSecure,
      redirectHost
        ? `${redirectSecure ? 'https' : 'NOT https'}://${redirectHost}`
        : 'BRIGHT_MLS_REDIRECT_BASE_URL is not a usable URL.',
    );

    let signingOk = false;
    let signingDetail = 'BRIGHT_MLS_MEDIA_SIGNING_SECRET is not set, so no media link could be signed.';
    if (config.mediaSigningSecret) {
      try {
        const token = await signBrightMediaToken(
          { requestId: 'self_test', fileId: 'self_test', expiresAt: Date.now() + 60_000 },
          config.mediaSigningSecret,
        );
        const verified = await verifyBrightMediaToken(token, config.mediaSigningSecret, Date.now());
        signingOk = !!verified.valid;
        signingDetail = signingOk
          ? 'A test link was signed and verified with the configured secret.'
          : `The configured secret did not produce a verifiable link: ${verified.reason || 'unknown reason'}.`;
      } catch (error: any) {
        signingDetail = `Signing failed: ${error?.message || error}`;
      }
    }
    record('signing_secret', 'Media link signing', signingOk, signingDetail);

    const failing = checks.filter((check) => check.status === 'fail');

    return Response.json({
      success: true,
      checked_at: new Date().toISOString(),
      checked_by: auth.actorEmail || auth.actor || null,
      configured: missing.length === 0,
      missing,
      checks,
      failing_count: failing.length,
      ready_to_submit: brightConfigComplete(config) && signingOk && failing.length === 0,
      link_lifetime_days: Math.round(BRIGHT_MEDIA_URL_TTL_HOURS / 24),
      authentication: {
        verified: false,
        can_be_verified_here: false,
        reason:
          'Bright documents no authentication or ping endpoint that can be called without submitting a manifest, so these credentials cannot be proven from this check.',
        how_it_is_proven:
          'A real manifest submission is the only authentication test. A 401 or 403 response there means the API key or vendor ID is wrong; any other response means authentication passed.',
        submitted_nothing: true,
      },
      note: 'Nothing was sent to Bright. This check makes no network call to Bright at all.',
    });
  } catch (error: any) {
    console.error('testBrightConnection error:', error);
    return Response.json({ error: error?.message || 'The Bright connection could not be checked' }, { status: 500 });
  }
});