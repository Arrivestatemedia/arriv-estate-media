import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { task_id, file_url, file_name, content_type } = body;

    if (!task_id || !file_url) {
      return Response.json({ error: 'Missing task_id or file_url' }, { status: 400 });
    }

    // 1. Look up the editing task
    const task = await base44.asServiceRole.entities.EditingTask.get(task_id);
    if (!task) {
      return Response.json({ error: 'Editing task not found' }, { status: 404 });
    }

    // 2. Look up the parent job to get the Google Drive folder
    const job = await base44.asServiceRole.entities.Job.get(task.job_id);
    if (!job || !job.google_drive_folder_url) {
      return Response.json({ error: 'Job has no Google Drive folder configured' }, { status: 400 });
    }

    // Extract the folder ID from the job's Google Drive URL
    const folderIdMatch = job.google_drive_folder_url.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (!folderIdMatch) {
      return Response.json({ error: 'Cannot parse folder ID from job Google Drive URL' }, { status: 400 });
    }
    const parentFolderId = folderIdMatch[1];

    // 3. Get Google Drive access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { 'Authorization': `Bearer ${accessToken}` };

    // 4. Find or create the "Final Edits" subfolder inside the job's Drive folder
    let finalEditsFolderId = job.final_edits_folder_id;
    let finalEditsFolderUrl = job.final_edits_folder_url;

    if (!finalEditsFolderId) {
      // Search for an existing "Final Edits" folder created by this app
      const searchQuery = `name='Final Edits' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name)`;
      const searchRes = await fetch(searchUrl, { headers: authHeader });
      const searchData = await searchRes.json();

      if (searchData.files && searchData.files.length > 0) {
        finalEditsFolderId = searchData.files[0].id;
      } else {
        // Create the "Final Edits" subfolder
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
          method: 'POST',
          headers: {
            ...authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Final Edits',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.text();
          console.error('Failed to create Final Edits folder:', err);
          return Response.json({ error: 'Failed to create Final Edits folder in Google Drive' }, { status: 500 });
        }
        const createData = await createRes.json();
        finalEditsFolderId = createData.id;
      }

      finalEditsFolderUrl = `https://drive.google.com/drive/folders/${finalEditsFolderId}`;

      // Cache the folder ID on the job so we don't search/create again
      await base44.asServiceRole.entities.Job.update(job.id, {
        final_edits_folder_id: finalEditsFolderId,
        final_edits_folder_url: finalEditsFolderUrl,
      });
    }

    // 5. Download the file from the Base44 file_url
    const fileRes = await fetch(file_url);
    if (!fileRes.ok) {
      return Response.json({ error: 'Failed to download uploaded file' }, { status: 500 });
    }
    const fileBuffer = await fileRes.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // 6. Upload to Google Drive using multipart upload (metadata + binary content)
    const boundary = '-------314159265358979323846';
    const encoder = new TextEncoder();

    const metadataJson = JSON.stringify({
      name: file_name || 'final_edit',
      parents: [finalEditsFolderId],
    });

    const part1 = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadataJson}\r\n`
    );
    const part2 = encoder.encode(
      `--${boundary}\r\nContent-Type: ${content_type || 'application/octet-stream'}\r\n\r\n`
    );
    const part3 = encoder.encode(`\r\n--${boundary}--`);

    const bodyBytes = new Uint8Array(part1.length + part2.length + fileBytes.length + part3.length);
    bodyBytes.set(part1, 0);
    bodyBytes.set(part2, part1.length);
    bodyBytes.set(fileBytes, part1.length + part2.length);
    bodyBytes.set(part3, part1.length + part2.length + fileBytes.length);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
      {
        method: 'POST',
        headers: {
          ...authHeader,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: bodyBytes,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('Google Drive upload failed:', err);
      return Response.json({ error: 'Failed to upload file to Google Drive' }, { status: 500 });
    }

    const uploadData = await uploadRes.json();
    const driveFileUrl = uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`;

    // 7. Update the editing task with the final media location
    await base44.asServiceRole.entities.EditingTask.update(task_id, {
      final_media_location: driveFileUrl,
      final_storage_provider: 'GOOGLE_DRIVE',
    });

    return Response.json({
      success: true,
      file_id: uploadData.id,
      file_url: driveFileUrl,
      file_name: uploadData.name,
      final_edits_folder_url: finalEditsFolderUrl,
    });
  } catch (error) {
    console.error('uploadFinalEdit error:', error);
    return Response.json({ error: error.message || 'Unknown error occurred' }, { status: 500 });
  }
});