import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import { listDeliveryFiles, sanitizeLabel } from '../../shared/mlsJobContext.ts';
import { buildZipResponse, zipNameForAddress, ZipTooLargeError } from '../../shared/mediaZip.ts';

/**
 * downloadMlsPhotosZip
 * The administrator's upload package: one ZIP containing exactly the photographs the customer
 * selected, in the customer's chosen order, numbered so the order survives extraction:
 *
 *   001_Front_Exterior.jpg
 *   002_Living_Room.jpg
 *
 * The original Drive files are never renamed, moved or modified — the numbering exists only in
 * the archive. Only photographs are included; the video travels as a YouTube URL, not a file.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { requestId } = body || {};

    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: 403 });

    if (!requestId) return Response.json({ error: 'requestId is required' }, { status: 400 });

    const rows = await base44.asServiceRole.entities.MlsUploadRequest.filter({ request_id: requestId }, undefined, 1);
    const request = rows?.[0];
    if (!request) return Response.json({ error: 'MLS request not found' }, { status: 404 });

    const job = await base44.asServiceRole.entities.Job.get(request.job_id);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    const { files } = await listDeliveryFiles(base44, job);
    const byId = new Map(files.map((f) => [f.id, f]));

    const orderedIds: string[] = Array.isArray(request.selected_photo_order) && request.selected_photo_order.length > 0
      ? request.selected_photo_order
      : (request.selected_photo_ids || []);

    const entries = [];
    const sizes: Record<string, number | undefined> = {};
    let index = 0;

    for (const id of orderedIds) {
      const file = byId.get(String(id));
      if (!file || !file.isImage) continue;
      index += 1;
      const ext = (file.name.match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase() || 'jpg';
      const entryName = `${String(index).padStart(3, '0')}_${sanitizeLabel(file.name)}.${ext}`;
      entries.push({ driveFileId: file.id, entryName });
      sizes[file.id] = file.size;
    }

    if (entries.length === 0) {
      return Response.json({ error: 'This request has no photographs to package.' }, { status: 400 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    return await buildZipResponse({
      authToken: accessToken,
      entries,
      downloadName: zipNameForAddress(request.property_address, `MLS_${request.mls_number}_Photos`),
      sizes,
    });
  } catch (error: any) {
    if (error instanceof ZipTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    console.error('downloadMlsPhotosZip error:', error);
    return Response.json({ error: error?.message || 'Could not build the photo package' }, { status: 500 });
  }
});