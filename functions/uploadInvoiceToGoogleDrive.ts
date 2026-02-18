import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { fileName, pdfBase64, folderType } = await req.json();

    const folderId = folderType === 'unpaid' 
      ? '1SQSZErZthzQYpz9qDpnlmVnB1AOzw6JY'
      : '1KIGXqbeiF4JU1uSYKu92pA_1PJIyskHS';

    // Get access token - try user token first, then service role
    let accessToken;
    try {
      const user = await base44.auth.me();
      if (user) {
        accessToken = await base44.connectors.getAccessToken('googledrive');
      } else {
        accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
      }
    } catch (e) {
      accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    }

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
      parents: [folderId],
      mimeType
    };

    // Create multipart upload
    const boundary = '===============7330845974216740156==';
    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const filePart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--`;

    // Combine parts - need to handle binary data
    const metadataBuffer = new TextEncoder().encode(metadataPart);
    const filePartBuffer = new TextEncoder().encode(filePart);
    const footerBuffer = new TextEncoder().encode(footer);

    const totalLength = metadataBuffer.length + filePartBuffer.length + bytes.length + footerBuffer.length;
    const body = new Uint8Array(totalLength);
    let offset = 0;

    body.set(metadataBuffer, offset);
    offset += metadataBuffer.length;
    body.set(filePartBuffer, offset);
    offset += filePartBuffer.length;
    body.set(bytes, offset);
    offset += bytes.length;
    body.set(footerBuffer, offset);

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