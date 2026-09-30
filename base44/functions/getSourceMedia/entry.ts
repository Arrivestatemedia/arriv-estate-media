import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';

/**
 * getSourceMedia
 * Lists all files in a job's Google Drive source folder for admin/editor viewing.
 * Returns file metadata with download links so the admin can view and download
 * the raw footage uploaded by the media specialist.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body: any = {};
    try {
      const bodyText = await req.clone().text();
      if (bodyText) body = JSON.parse(bodyText);
    } catch { /* empty body */ }

    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: 403 });
    }

    const { jobId } = body;
    if (!jobId) {
      return Response.json({ error: 'jobId is required' }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Resolve the Drive folder ID
    let folderId = job.source_storage_folder_id;
    if (!folderId && job.google_drive_folder_url) {
      const match = job.google_drive_folder_url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (match) folderId = match[1];
    }
    if (!folderId) {
      return Response.json({
        files: [],
        job: { title: job.title, location: job.location, date: job.date },
        source_archived: job.source_archived || false,
      });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // List files in the folder (exclude subfolders)
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,thumbnailLink,hasThumbnail,modifiedTime,iconLink,webContentLink)&orderBy=modifiedTime+desc&pageSize=1000`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
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
      webContentLink: f.webContentLink,
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
      source_archived: job.source_archived || false,
      archive_folder_id: job.source_archive_folder_id || null,
    });
  } catch (error) {
    console.error('getSourceMedia error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});