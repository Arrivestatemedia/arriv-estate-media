import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const UNPAID_FOLDER_ID = '1SQSZErZthzQYpz9qDpnlmVnB1AOzw6JY';
const PAID_FOLDER_ID = '1KIGXqbeiF4JU1uSYKu92pA_1PJIyskHS';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { fileName, invoiceContent, folderType, invoiceNumber, stripeLink, markAsPaid } = await req.json();

    const folderId = folderType === 'unpaid' ? UNPAID_FOLDER_ID : PAID_FOLDER_ID;

    // Get Google Drive access token via admin authorization
    let accessToken;
    try {
      accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    } catch (e) {
      console.error('Token fetch error:', e.message);
      throw e;
    }
    
    // Simple text-based invoice
    let invoiceText = invoiceContent || 'Invoice';
    if (markAsPaid) {
      invoiceText = '[PAID]\n\n' + invoiceText;
    }
    if (stripeLink) {
      invoiceText += '\n\nPay here: ' + stripeLink;
    }
    
    // Create metadata
    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'text/plain'
    };
    
    // Prepare multipart body
    const boundary = '===============7330845974216740156==';
    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const filePart = `--${boundary}\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa(invoiceText)}\r\n--${boundary}--`;
    const body = metadataPart + filePart;
    
    const uploadResponse = await fetch(
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

    const fileData = await uploadResponse.json();

    if (!uploadResponse.ok) {
      console.error('Upload response status:', uploadResponse.status);
      console.error('Error details:', JSON.stringify(fileData, null, 2));
      console.error('Folder ID being used:', folderId);
      throw new Error(`Google Drive error: ${fileData.error?.message || JSON.stringify(fileData)}`);
    }
    
    // Make file shareable
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone'
        })
      });
    } catch (e) {
      console.error('Permission error:', e.message);
    }
    
    const fileUrl = `https://drive.google.com/file/d/${fileData.id}/view?usp=sharing`;
    
    return Response.json({
      success: true,
      fileId: fileData.id,
      fileUrl
    });
    
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});