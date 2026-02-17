import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { fileName, receiptContent, userId } = await req.json();

    // Get Google Drive access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Target folder ID: 1I0WK_dCcoI8U5DDHzJq-SGxsFean-rTk
    const folderId = '1I0WK_dCcoI8U5DDHzJq-SGxsFean-rTk';

    // Create file metadata
    const metadata = {
      name: fileName,
      mimeType: 'application/pdf',
      parents: [folderId]
    };

    // Convert receipt content to PDF-like format (simplified)
    const fileContent = new Blob([receiptContent], { type: 'application/pdf' });

    // Upload to Google Drive using multipart upload
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', fileContent);

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: form
      }
    );

    const uploadData = await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload to Google Drive: ${JSON.stringify(uploadData)}`);
    }

    // Get shareable link
    const fileId = uploadData.id;
    const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;

    return Response.json({
      success: true,
      driveUrl,
      fileId
    });

  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});