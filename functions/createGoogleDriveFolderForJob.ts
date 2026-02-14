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
    console.log('Created folder:', folderId);

    // Share folder with media partner
    const shareRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions?fields=id`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'editor',
        type: 'user',
        emailAddress: mediaPartnerEmail,
      }),
    });

    if (!shareRes.ok) {
      const error = await shareRes.text();
      console.error('Failed to share folder:', error);
      return Response.json({ error: 'Failed to share Google Drive folder' }, { status: 500 });
    }

    console.log('Folder shared with:', mediaPartnerEmail);

    return Response.json({
      success: true,
      folderId: folderId,
      folderName: jobAddress,
      sharedWith: mediaPartnerEmail,
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message || 'Unknown error occurred' }, { status: 500 });
  }
});