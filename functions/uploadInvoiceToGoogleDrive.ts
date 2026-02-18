import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
        try {
          const base44 = createClientFromRequest(req);
          const { fileName, pdfBase64, folderType } = await req.json();

          console.log('uploadInvoiceToGoogleDrive called with fileName:', fileName, 'folderType:', folderType);

          const folderId = folderType === 'unpaid' 
            ? '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh'
            : '1Jwc1L00KV-lseq1kGEo8jcN5sTJ9LoOt';

          // Get access token using service role (app connector authorized by admin)
          console.log('Getting Google Drive access token...');
          const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    console.log('Access token obtained, length:', accessToken.length);

    // Convert base64 to binary
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create file metadata
    const mimeType = fileName.endsWith('.html') ? 'text/html' : 'application/pdf';
    const metadata = {
      name: fileName,
      parents: [folderId]
    };

    // Use FormData for proper multipart encoding
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([bytes], { type: mimeType }));

    // Upload to Drive
    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: form
      }
    );

    const fileData = await uploadRes.json();

    if (!uploadRes.ok) {
      console.error('Drive upload response:', JSON.stringify(fileData));
      throw new Error(`Drive upload failed: ${fileData.error?.message || 'Unknown error'} - Status: ${uploadRes.status}`);
    }

    // Make shareable
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    }).catch(() => {});

    const fileUrl = `https://drive.google.com/file/d/${fileData.id}/view`;

    return Response.json({ success: true, fileId: fileData.id, fileUrl });

  } catch (error) {
    console.error('Upload error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});