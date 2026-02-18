import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const UNPAID_FOLDER_ID = '1SQSZErZthzQYpz9qDpnlmVnB1AOzw6JY';
const PAID_FOLDER_ID = '1KIGXqbeiF4JU1uSYKu92pA_1PJIyskHS';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { fileName, invoiceContent, folderType, invoiceNumber, stripeLink, markAsPaid } = await req.json();

    const folderId = folderType === 'unpaid' ? UNPAID_FOLDER_ID : PAID_FOLDER_ID;

    // Get Google Drive access token via service role
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    
    // Simple text-based invoice
    let invoiceText = invoiceContent || 'Invoice';
    if (markAsPaid) {
      invoiceText = '[PAID]\n\n' + invoiceText;
    }
    if (stripeLink) {
      invoiceText += '\n\nPay here: ' + stripeLink;
    }
    const pdfContent = new TextEncoder().encode(invoiceText);
    const blob = new Blob([pdfContent], { type: 'application/pdf' });
    
    // Upload to Google Drive
    const metadata = {
      name: fileName,
      parents: [folderId]
    };
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    
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
    
    const fileData = await uploadResponse.json();
    
    if (!uploadResponse.ok) {
      throw new Error(`Google Drive error: ${fileData.error?.message || 'Unknown error'}`);
    }
    
    // Make file shareable
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