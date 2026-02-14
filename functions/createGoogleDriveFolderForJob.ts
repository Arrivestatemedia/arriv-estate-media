import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { jobAddress, mediaPartnerEmail } = body;

    if (!jobAddress || !mediaPartnerEmail) {
      return Response.json({ error: 'Missing jobAddress or mediaPartnerEmail' }, { status: 400 });
    }

    // Get Google Drive access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Create folder with job address as name inside the parent shared folder
    const parentFolderId = '13Mh1TFk_FsUb7QjNTg5LmvIBeTc1ALdJ';
    const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: jobAddress,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    });

    if (!createFolderRes.ok) {
      const error = await createFolderRes.text();
      console.error('Failed to create folder:', error);
      return Response.json({ error: 'Failed to create Google Drive folder' }, { status: 500 });
    }

    const folderData = await createFolderRes.json();
    const folderId = folderData.id;
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    console.log('Created folder:', folderId);

    // Folder inherits sharing from parent folder (already shared with anyone who has the link)
    return Response.json({
      success: true,
      folderId: folderId,
      folderUrl: folderUrl,
      folderName: jobAddress,
      note: 'Folder created inside shared parent - automatically accessible',
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message || 'Unknown error occurred' }, { status: 500 });
  }
});