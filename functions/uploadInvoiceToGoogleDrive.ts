import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { fileName, invoiceContent, folderType } = await req.json();

    const folderId = folderType === 'unpaid' 
      ? '1SQSZErZthzQYpz9qDpnlmVnB1AOzw6JY'
      : '1KIGXqbeiF4JU1uSYKu92pA_1PJIyskHS';

    // Get access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Create file metadata and content
    const metadata = {
      name: fileName,
      parents: [folderId]
    };

    // Create form data with metadata and file content
    const boundary = '===============7330845974216740156==';
    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const contentPart = `--${boundary}\r\nContent-Type: text/plain\r\n\r\n${invoiceContent}\r\n--${boundary}--`;
    const body = metadataPart + contentPart;

    // Upload to Drive
    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: body
      }
    );

    const fileData = await uploadRes.json();

    if (!uploadRes.ok) {
      throw new Error(`Drive upload failed: ${fileData.error?.message || 'Unknown error'}`);
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