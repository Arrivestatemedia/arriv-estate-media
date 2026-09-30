import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * getJobMediaForClient
 * Lists all files in a job's Google Drive folder for client viewing.
 *
 * Auth: Clients authenticate via PendingSignup (localStorage), NOT Base44 auth.
 * Ownership is verified by checking job.client_email === clientEmail.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { jobId, clientEmail, adminPreview } = body;

    if (!jobId) {
      return Response.json({ error: 'jobId is required' }, { status: 400 });
    }

    // Look up the job (asServiceRole bypasses RLS)
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Authorization: either the client owns this job, or an admin is previewing
    if (adminPreview) {
      try {
        const me = await base44.auth.me();
        if (!me || me.role !== 'admin') {
          return Response.json({ error: 'Unauthorized: admin access required for preview' }, { status: 403 });
        }
      } catch {
        return Response.json({ error: 'Unauthorized: admin access required for preview' }, { status: 403 });
      }
    } else {
      if (!clientEmail) {
        return Response.json({ error: 'clientEmail is required' }, { status: 400 });
      }
      // Verify the client owns this job
      if (job.client_email !== clientEmail) {
        return Response.json({ error: 'Unauthorized: this job does not belong to you' }, { status: 403 });
      }
    }

    // Gate: only show media to clients when editing is complete.
    // Admins can always preview (bypass this gate).
    if (!adminPreview) {
      const editingCompleteStatuses = ['delivered', 'ready_for_delivery', 'no_editing_required'];
      if (!editingCompleteStatuses.includes(job.production_status)) {
        return Response.json({
          files: [],
          job: { title: job.title, location: job.location, date: job.date, type: job.type },
          editing_in_progress: true,
        });
      }
    }

    // Resolve the Drive folder ID
    let folderId = job.source_storage_folder_id;
    if (!folderId && job.google_drive_folder_url) {
      const match = job.google_drive_folder_url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (match) folderId = match[1];
    }
    if (!folderId) {
      return Response.json({ files: [], job: { title: job.title, location: job.location, date: job.date } });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // List files in the folder (exclude subfolders)
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,thumbnailLink,hasThumbnail,modifiedTime,iconLink)&orderBy=modifiedTime+desc&pageSize=1000`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error('Drive list failed:', errText);
      return Response.json({ error: 'Failed to list files from Google Drive' }, { status: 500 });
    }

    const listData = await listRes.json();
    const files = (listData.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      thumbnailLink: f.thumbnailLink,
      hasThumbnail: f.hasThumbnail,
      modifiedTime: f.modifiedTime,
      iconLink: f.iconLink,
      isImage: f.mimeType?.startsWith('image/'),
      isVideo: f.mimeType?.startsWith('video/'),
    }));

    return Response.json({
      files,
      job: {
        title: job.title,
        location: job.location,
        date: job.date,
        type: job.type,
      },
    });
  } catch (error) {
    console.error('getJobMediaForClient error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});