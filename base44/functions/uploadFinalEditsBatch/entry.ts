import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const CLASSIFIABLE_REGEX = /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i;
const RAW_FORMATS = ['arw', 'dng', 'cr2', 'nef', 'raf', 'orf', 'rw2', 'pef', 'srw', 'tiff', 'tif', 'bmp'];

function isClassifiableImage(contentType: string | undefined, fileName: string): boolean {
  const ext = (fileName.match(/\.([a-zA-Z0-9]+)$/) || [])[1]?.toLowerCase() || '';
  if (RAW_FORMATS.includes(ext)) return false;
  if (contentType?.startsWith('image/') && !RAW_FORMATS.some(rf => contentType.toLowerCase().includes(rf))) return true;
  return CLASSIFIABLE_REGEX.test(fileName);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { task_id, files } = body;

    if (!task_id || !Array.isArray(files) || files.length === 0) {
      return Response.json({ error: 'task_id and non-empty files array required' }, { status: 400 });
    }

    // 1. Look up the editing task + job
    const task = await base44.asServiceRole.entities.EditingTask.get(task_id);
    if (!task) return Response.json({ error: 'Editing task not found' }, { status: 404 });

    const job = await base44.asServiceRole.entities.Job.get(task.job_id);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    // 2. Resolve the job's root Google Drive folder
    let folderId = job.source_storage_folder_id;
    if (!folderId && job.google_drive_folder_url) {
      const m = job.google_drive_folder_url.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (m) folderId = m[1];
    }
    if (!folderId) return Response.json({ error: 'Job has no Google Drive folder configured' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader: Record<string, string> = { Authorization: `Bearer ${accessToken}` };

    // 3. List existing files in the folder (for duplicate-name handling)
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name)&pageSize=1000`,
      { headers: authHeader }
    );
    const listData = await listRes.json();
    const existingNames = new Set((listData.files || []).map((f: any) => f.name.toLowerCase()));

    // 4. Determine which files are classifiable images
    const classifiableIndices: number[] = [];
    files.forEach((f: any, idx: number) => {
      if (isClassifiableImage(f.content_type, f.file_name)) classifiableIndices.push(idx);
    });

    // 5. AI-classify images in chunks of 10
    const labelByIndex: Record<number, string> = {};
    const CHUNK = 10;
    for (let i = 0; i < classifiableIndices.length; i += CHUNK) {
      const chunkIndices = classifiableIndices.slice(i, i + CHUNK);
      const chunkUrls = chunkIndices.map(idx => files[idx].file_url);
      const prompt = `You are a real estate photography assistant. I am providing ${chunkUrls.length} property photos. For EACH image (in the order provided), identify the room or scene shown and return a concise label (1-3 words, Title Case). Use standard real estate scene labels such as: Bedroom, Bathroom, Kitchen, Living Room, Dining Room, Family Room, Office, Garage, Backyard, Front Exterior, Rear Exterior, Patio, Deck, Basement, Hallway, Closet, Laundry Room, Staircase, Fireplace, Pool, Balcony, Foyer, Driveway, Neighborhood, Aerial, Detail, Floor Plan. Return EXACTLY ${chunkUrls.length} labels in the "labels" array, one per image, in the same order as the images were provided.`;
      try {
        const llmRes = await base44.integrations.Core.InvokeLLM({
          prompt,
          file_urls: chunkUrls,
          response_json_schema: {
            type: "object",
            properties: {
              labels: { type: "array", items: { type: "string" } }
            }
          }
        });
        const llmData = llmRes?.data || llmRes;
        const chunkLabels = llmData?.labels || [];
        chunkIndices.forEach((idx, j) => {
          labelByIndex[idx] = (chunkLabels[j] || "").trim();
        });
      } catch (e) {
        console.error('AI classification chunk failed:', e);
        chunkIndices.forEach(idx => { labelByIndex[idx] = ""; });
      }
    }

    // 6. Upload each file with its determined name
    const results = [];
    for (let idx = 0; idx < files.length; idx++) {
      const f = files[idx];
      const ext = (f.file_name.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || 'jpg';
      const baseName = f.file_name.replace(/\.[^.]+$/, '');
      let finalName: string;

      const isClassifiable = classifiableIndices.includes(idx);
      if (isClassifiable) {
        const label = labelByIndex[idx] || "";
        if (label && baseName.toLowerCase() !== label.toLowerCase()) {
          finalName = `${label}.${ext}`;
        } else {
          finalName = f.file_name; // keep original if already matches the label
        }
      } else {
        finalName = f.file_name; // video or RAW: keep original name
      }

      // Duplicate handling: append " 2", " 3", etc.
      let candidate = finalName;
      let counter = 2;
      while (existingNames.has(candidate.toLowerCase())) {
        const nameNoExt = finalName.replace(/\.[^.]+$/, '');
        candidate = `${nameNoExt} ${counter}.${ext}`;
        counter++;
      }
      finalName = candidate;
      existingNames.add(finalName.toLowerCase());

      // Download from the public file URL
      let fileRes;
      try {
        fileRes = await fetch(f.file_url);
      } catch (e) { continue; }
      if (!fileRes.ok) continue;
      const fileBuffer = await fileRes.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);

      // Multipart upload to Google Drive
      const boundary = '-------314159265358979323846';
      const encoder = new TextEncoder();
      const metadataJson = JSON.stringify({ name: finalName, parents: [folderId] });
      const part1 = encoder.encode(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadataJson}\r\n`);
      const part2 = encoder.encode(`--${boundary}\r\nContent-Type: ${f.content_type || 'application/octet-stream'}\r\n\r\n`);
      const part3 = encoder.encode(`\r\n--${boundary}--`);
      const bodyBytes = new Uint8Array(part1.length + part2.length + fileBytes.length + part3.length);
      bodyBytes.set(part1, 0);
      bodyBytes.set(part2, part1.length);
      bodyBytes.set(fileBytes, part1.length + part2.length);
      bodyBytes.set(part3, part1.length + part2.length + fileBytes.length);

      const uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
        {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: bodyBytes,
        }
      );

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        results.push({
          original_name: f.file_name,
          new_name: finalName,
          file_id: uploadData.id,
          scene_label: isClassifiable ? (labelByIndex[idx] || null) : null,
        });
      } else {
        results.push({ original_name: f.file_name, new_name: finalName, file_id: null, error: 'Upload to Google Drive failed' });
      }
    }

    // 7. Update the editing task with the folder URL
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    await base44.asServiceRole.entities.EditingTask.update(task_id, {
      final_media_location: folderUrl,
      final_storage_provider: 'GOOGLE_DRIVE',
    });

    return Response.json({ success: true, results, folder_url: folderUrl });
  } catch (error) {
    console.error('uploadFinalEditsBatch error:', error);
    return Response.json({ error: error.message || 'Unknown error occurred' }, { status: 500 });
  }
});