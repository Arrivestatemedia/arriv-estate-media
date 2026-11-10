import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { ownsJob, listDeliveryFiles } from '../../shared/mlsJobContext.ts';
import { buildZipResponse, zipNameForAddress, ZipTooLargeError } from '../../shared/mediaZip.ts';
import { requireCustomer } from '../../shared/customerSession.ts';

/**
 * downloadGalleryZip
 * One download for multiple selected files in the customer's delivery gallery.
 *
 * Ownership is verified server-side against the job's client_email, and every requested file must
 * already be in the job's delivery folder, so this cannot be used to fetch arbitrary Drive files.
 *
 * Videos are refused here on purpose: a delivered MP4 is far too large for a ZIP built inside a
 * request. The gallery downloads those individually through the existing single-file endpoint,
 * which stays exactly as it was. Photographs and documents are stored uncompressed, so the
 * customer receives the same bytes that were delivered.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { jobId, clientEmail, fileIds } = body || {};

    if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400 });
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return Response.json({ error: 'Select the media you want to download.' }, { status: 400 });
    }

    // Identity comes from the signed customer session; the body's clientEmail is never trusted.
    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
    if (!ownsJob(job, auth.actor.email)) {
      return Response.json({ error: 'Unauthorized: this job does not belong to you' }, { status: 403 });
    }

    const { files } = await listDeliveryFiles(base44, job);
    const byId = new Map(files.map((f) => [f.id, f]));

    const entries = [];
    const sizes: Record<string, number | undefined> = {};
    const skippedVideos: string[] = [];
    const missing: string[] = [];
    const usedNames = new Set<string>();

    for (const rawId of fileIds) {
      const file = byId.get(String(rawId));
      if (!file) { missing.push(String(rawId)); continue; }
      if (file.isVideo) { skippedVideos.push(file.name); continue; }

      let name = file.name || 'file';
      if (usedNames.has(name.toLowerCase())) {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let counter = 2;
        while (usedNames.has(`${base} (${counter})${ext}`.toLowerCase())) counter += 1;
        name = `${base} (${counter})${ext}`;
      }
      usedNames.add(name.toLowerCase());

      entries.push({ driveFileId: file.id, entryName: name });
      sizes[file.id] = file.size;
    }

    if (entries.length === 0) {
      return Response.json({
        error: skippedVideos.length > 0
          ? 'Videos download individually. Select your photographs and documents for the ZIP.'
          : 'None of those files are available to download.',
        skipped_videos: skippedVideos,
      }, { status: 400 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    return await buildZipResponse({
      authToken: accessToken,
      entries,
      downloadName: zipNameForAddress(job.location || job.title || 'Arriv', 'Media'),
      sizes,
    });
  } catch (error: any) {
    if (error instanceof ZipTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    console.error('downloadGalleryZip error:', error);
    return Response.json({ error: error?.message || 'Could not build the download' }, { status: 500 });
  }
});