import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';

/**
 * archiveSourceMedia
 * Creates a "{address} - Archive" folder in Google Drive and moves all source
 * files from the job's main Drive folder into it. This clears the main folder
 * so the editor can upload final edits there.
 *
 * Also marks the job's source as archived.
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

    // Resolve the source Drive folder ID
    let folderId = job.source_storage_folder_id;
    if (!folderId && job.google_drive_folder_url) {
      const match = job.google_drive_folder_url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (match) folderId = match[1];
    }
    if (!folderId) {
      return Response.json({ error: 'No source folder found for this job' }, { status: 400 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Build archive folder name: "{address} - Archive"
    const address = job.location || job.title || 'Unknown';
    const archiveFolderName = `${address} - Archive`;

    // Get the source folder's parent so the archive folder is a sibling
    let parents: string[] = [];
    try {
      const folderRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=parents`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      if (folderRes.ok) {
        const folderData = await folderRes.json();
        parents = folderData.parents || [];
      }
    } catch { /* use root if no parents */ }

    // Create the archive folder
    const createBody: any = {
      name: archiveFolderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parents.length > 0) createBody.parents = parents;

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error('Failed to create archive folder:', errText);
      return Response.json({ error: 'Failed to create archive folder' }, { status: 500 });
    }

    const archiveFolder = await createRes.json();
    const archiveFolderId = archiveFolder.id;

    // List all files in the source folder (exclude subfolders)
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&pageSize=1000`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      return Response.json({ error: 'Failed to list source files' }, { status: 500 });
    }

    const listData = await listRes.json();
    const files = (listData.files || []).filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder');

    // Move each file to the archive folder
    let movedCount = 0;
    for (const file of files) {
      const moveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?addParents=${encodeURIComponent(archiveFolderId)}&removeParents=${encodeURIComponent(folderId)}&fields=id`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );
      if (moveRes.ok) movedCount++;
    }

    // Update job with archive info
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.Job.update(jobId, {
      source_archived: true,
      source_archived_at: now,
      source_archive_folder_id: archiveFolderId,
    });

    return Response.json({
      success: true,
      archive_folder_id: archiveFolderId,
      archive_folder_name: archiveFolderName,
      files_moved: movedCount,
    });
  } catch (error) {
    console.error('archiveSourceMedia error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});