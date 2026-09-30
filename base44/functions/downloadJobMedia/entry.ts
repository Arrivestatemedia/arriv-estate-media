import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * downloadJobMedia
 * Downloads a single file from the job's Google Drive folder and streams it
 * to the client. Returns the raw binary response.
 *
 * Auth: Clients authenticate via PendingSignup (localStorage), NOT Base44 auth.
 * Ownership is verified by checking job.client_email === clientEmail.
 *
 * Called via base44.functions.fetch() (not invoke) so the raw Response is
 * available for blob conversion in the frontend.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { jobId, clientEmail, fileId } = body;

    if (!jobId || !clientEmail || !fileId) {
      return Response.json({ error: 'jobId, clientEmail, and fileId are required' }, { status: 400 });
    }

    // Look up the job (asServiceRole bypasses RLS)
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify the client owns this job
    if (job.client_email !== clientEmail) {
      return Response.json({ error: 'Unauthorized: this job does not belong to you' }, { status: 403 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Get file metadata (for name and content-type)
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!metaRes.ok) {
      return Response.json({ error: 'File not found in Google Drive' }, { status: 404 });
    }

    const meta = await metaRes.json();

    // Download the file content (alt=media)
    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!downloadRes.ok) {
      return Response.json({ error: 'Failed to download file from Google Drive' }, { status: 500 });
    }

    // Stream the file content back to the client
    const fileBuffer = await downloadRes.arrayBuffer();
    const contentType = meta.mimeType || 'application/octet-stream';
    const fileName = meta.name || 'download';

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
        'Content-Length': String(fileBuffer.byteLength),
      },
    });
  } catch (error) {
    console.error('downloadJobMedia error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});