import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * initiateFootageUpload
 * Starts a Google Drive resumable upload session for a single file and returns
 * the session URI. The browser then streams the file directly to that URI in
 * chunks, so large videos bypass this function's request-size limit entirely.
 *
 * Auth: Media partners authenticate via PendingSignup (localStorage), NOT Base44 auth.
 * Ownership is verified by checking job.booked_by === mediaPartnerEmail.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { jobId, mediaPartnerEmail, fileName, mimeType, fileSize } = body;

    if (!jobId || !mediaPartnerEmail || !fileName) {
      return Response.json({ error: 'jobId, mediaPartnerEmail, and fileName are required' }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.booked_by !== mediaPartnerEmail) {
      return Response.json({ error: 'Unauthorized: you did not book this job' }, { status: 403 });
    }

    let folderId = job.source_storage_folder_id;
    if (!folderId && job.google_drive_folder_url) {
      const match = job.google_drive_folder_url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (match) folderId = match[1];
    }
    if (!folderId) {
      return Response.json({ error: 'No Google Drive folder associated with this job' }, { status: 400 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,thumbnailLink,hasThumbnail,modifiedTime',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType || 'application/octet-stream',
          ...(fileSize ? { 'X-Upload-Content-Length': String(fileSize) } : {}),
        },
        body: metadata,
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      console.error('Drive resumable session init failed:', errText);
      return Response.json({ error: 'Failed to start upload session' }, { status: 500 });
    }

    const sessionUri = initRes.headers.get('Location');
    if (!sessionUri) {
      return Response.json({ error: 'No upload session returned' }, { status: 500 });
    }

    if (job.source_upload_status === 'not_started') {
      await base44.asServiceRole.entities.Job.update(jobId, { source_upload_status: 'partial' });
    }

    return Response.json({ sessionUri });
  } catch (error) {
    console.error('initiateFootageUpload error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}