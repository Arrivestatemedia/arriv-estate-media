import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { loadBrightConfig } from '../../shared/brightMlsClient.ts';
import { verifyBrightMediaToken } from '../../shared/brightMediaUrls.ts';

/**
 * serveBrightMedia
 * The one place Bright's servers can read a delivered photograph.
 *
 * Bright fetches media without an Arriv session and without Google credentials, so this endpoint
 * cannot require a login. What it requires instead is a signed token that:
 *   • is issued only inside a manifest we are about to send,
 *   • authorizes exactly one Drive file inside exactly one MLS request,
 *   • expires (BRIGHT_MEDIA_URL_TTL_HOURS).
 *
 * The token is also checked against the request record: a validly signed token for a file that is
 * not part of that request's customer selection is refused. No folder id, folder listing or Drive
 * credential is ever exposed — the response is the photograph's bytes and nothing else.
 */
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('t');
    if (!token) return Response.json({ error: 'Missing media token' }, { status: 400 });

    const { config } = loadBrightConfig();
    if (!config.mediaSigningSecret) {
      return Response.json({ error: 'Media links are not configured' }, { status: 503 });
    }

    const verdict = await verifyBrightMediaToken(token, config.mediaSigningSecret);
    if (!verdict.valid) {
      return Response.json({ error: verdict.reason || 'Media link is not valid' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    const rows = await base44.asServiceRole.entities.MlsUploadRequest.filter(
      { request_id: verdict.requestId },
      undefined,
      1,
    );
    const request = rows?.[0];
    if (!request) return Response.json({ error: 'Media link is not valid' }, { status: 404 });

    const selected = Array.isArray(request.selected_media) ? request.selected_media : [];
    const allowed = new Set<string>([
      ...(request.selected_photo_ids || []),
      ...(request.selected_video_ids || []),
      ...selected.map((m: any) => m?.drive_file_id),
    ].filter(Boolean).map(String));

    if (!allowed.has(String(verdict.fileId))) {
      return Response.json({ error: 'That file is not part of this request' }, { status: 403 });
    }

    const named = selected.find((m: any) => String(m?.drive_file_id) === String(verdict.fileId));
    const fileName = String(named?.name || '');
    const extension = (fileName.match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase() || 'jpg';
    const contentType = extension === 'png' ? 'image/png'
      : extension === 'webp' ? 'image/webp'
        : extension === 'heic' ? 'image/heic'
          : extension === 'heif' ? 'image/heif'
            : extension === 'mp4' ? 'video/mp4'
              : 'image/jpeg';

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    const drive = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(verdict.fileId))}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!drive.ok || !drive.body) {
      console.error('serveBrightMedia drive read failed:', drive.status);
      return Response.json({ error: 'That media file could not be read' }, { status: 502 });
    }

    // Bright must receive image (or video) bytes, never a Drive HTML page, consent screen or
    // redirect. Drive reports what it actually returned, so anything outside this list is refused
    // rather than passed through.
    const servedType = String(drive.headers.get('content-type') || contentType).split(';')[0].trim().toLowerCase();
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4'];
    if (!allowedTypes.includes(servedType)) {
      console.error('serveBrightMedia refused non-media content:', servedType);
      return Response.json({ error: 'That media file is not readable media' }, { status: 502 });
    }

    const headers: Record<string, string> = {
      'Content-Type': servedType,
      'Cache-Control': 'private, max-age=3600',
    };
    const length = drive.headers.get('content-length');
    if (length) headers['Content-Length'] = length;

    return new Response(drive.body, { status: 200, headers });
  } catch (error: any) {
    console.error('serveBrightMedia error:', error);
    return Response.json({ error: 'That media file could not be read' }, { status: 500 });
  }
});