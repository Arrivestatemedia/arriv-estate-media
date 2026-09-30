import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * uploadFootageToJobDrive
 * Receives a file from a media partner and uploads it to the job's Google Drive folder.
 * Since the app creates the file via the Drive API, it remains accessible with
 * the drive.file scope for later listing/downloading by the client gallery.
 *
 * Auth: Media partners authenticate via PendingSignup (localStorage), NOT Base44 auth.
 * Ownership is verified by checking job.booked_by === mediaPartnerEmail.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const formData = await req.formData();

    const file = formData.get('file');
    const jobId = formData.get('jobId');
    const mediaPartnerEmail = formData.get('mediaPartnerEmail');

    if (!file || !jobId || !mediaPartnerEmail) {
      return Response.json({ error: 'file, jobId, and mediaPartnerEmail are required' }, { status: 400 });
    }

    // Look up the job (asServiceRole bypasses RLS)
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify the media partner is the one who booked this job
    if (job.booked_by !== mediaPartnerEmail) {
      return Response.json({ error: 'Unauthorized: you did not book this job' }, { status: 403 });
    }

    // Resolve the Drive folder ID
    let folderId = job.source_storage_folder_id;
    if (!folderId && job.google_drive_folder_url) {
      const match = job.google_drive_folder_url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (match) folderId = match[1];
    }
    if (!folderId) {
      return Response.json({ error: 'No Google Drive folder associated with this job' }, { status: 400 });
    }

    // Get the Google Drive access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Read file content
    const fileBuffer = new Uint8Array(await file.arrayBuffer());
    const fileName = file.name || `upload_${Date.now()}`;
    const mimeType = file.type || 'application/octet-stream';

    // Build multipart/related body for Drive API
    const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
    const boundary = '-------arriv_boundary_' + crypto.randomUUID();
    const encoder = new TextEncoder();

    const pre = encoder.encode(
      `\r\n--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    );
    const post = encoder.encode(`\r\n--${boundary}--`);

    const body = new Uint8Array(pre.length + fileBuffer.length + post.length);
    body.set(pre, 0);
    body.set(fileBuffer, pre.length);
    body.set(post, pre.length + fileBuffer.length);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,thumbnailLink,hasThumbnail,modifiedTime',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: body,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('Drive upload failed:', errText);
      return Response.json({ error: 'Failed to upload file to Google Drive' }, { status: 500 });
    }

    const fileData = await uploadRes.json();

    // Update job source_upload_status if it was 'not_started'
    if (job.source_upload_status === 'not_started') {
      await base44.asServiceRole.entities.Job.update(jobId, { source_upload_status: 'partial' });
    }

    return Response.json({
      success: true,
      file: {
        id: fileData.id,
        name: fileData.name,
        mimeType: fileData.mimeType,
        size: fileData.size,
        thumbnailLink: fileData.thumbnailLink,
        hasThumbnail: fileData.hasThumbnail,
        modifiedTime: fileData.modifiedTime,
      },
    });
  } catch (error) {
    console.error('uploadFootageToJobDrive error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});