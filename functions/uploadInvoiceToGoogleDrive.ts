import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import jsPDF from 'npm:jspdf@4.0.0';

const UNPAID_FOLDER_ID = '1SQSZErZthzQYpz9qDpnlmVnB1AOzw6JY';
const PAID_FOLDER_ID = '1KIGXqbeiF4JU1uSYKu92pA_1PJIyskHS';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const { fileName, invoiceContent, folderType, invoiceNumber, stripeLink, markAsPaid } = await req.json();
    
    const folderId = folderType === 'unpaid' ? UNPAID_FOLDER_ID : PAID_FOLDER_ID;
    
    // Get Google Drive access token (user-authenticated)
    const accessToken = await base44.connectors.getAccessToken('googledrive');
    
    // Create actual PDF using jsPDF
    const { jsPDF: PDFConstructor } = await import('npm:jspdf@4.0.0');
    const doc = new PDFConstructor();
    
    if (markAsPaid) {
      doc.setTextColor(0, 128, 0);
      doc.setFontSize(20);
      doc.text('[PAID]', 20, 20);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
    }
    
    doc.setFontSize(12);
    doc.text(invoiceContent || 'Invoice', 20, 40);
    
    if (stripeLink) {
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 255);
      doc.textWithLink('Click here to pay', 20, doc.lastAutoTable?.finalY + 20 || 200, { pageNumber: 1 });
      doc.textWithLink(stripeLink, 20, doc.lastAutoTable?.finalY + 25 || 205, { pageNumber: 1 });
    }
    
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    
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