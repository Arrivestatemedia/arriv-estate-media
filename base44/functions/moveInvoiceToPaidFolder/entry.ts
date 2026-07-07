import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { invoiceId } = await req.json();
    if (!invoiceId) return Response.json({ error: 'invoiceId required' }, { status: 400 });

    const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];
    if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    if (!invoice.google_drive_file_id) return Response.json({ error: 'No Drive file ID on invoice' }, { status: 400 });

    const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    const unpaidFolderId = '1PMtihUlPa_LRcxYdi4ZDNeWWF2zfdv7J';
    const paidInvoicesFolderId = '1bYUAfs8BwNrar1sCsnISme1Ov7a0y2vn';

    // Get current parents
    const fileInfoRes = await fetch(`https://www.googleapis.com/drive/v3/files/${invoice.google_drive_file_id}?fields=parents`, {
      headers: { 'Authorization': `Bearer ${driveToken}` }
    });
    const fileInfo = await fileInfoRes.json();
    const currentParents = (fileInfo.parents || [unpaidFolderId]).join(',');

    // Move: add PAID folder, remove old parents
    const moveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${invoice.google_drive_file_id}?addParents=${paidInvoicesFolderId}&removeParents=${currentParents}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const moveData = await moveRes.json();
    if (!moveRes.ok) return Response.json({ error: `Move failed: ${JSON.stringify(moveData.error)}` }, { status: 500 });

    // Record the paid invoice link on the invoice record
    const linkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${invoice.google_drive_file_id}?fields=webViewLink`, {
      headers: { 'Authorization': `Bearer ${driveToken}` }
    });
    const linkData = await linkRes.json();

    return Response.json({ success: true, moved: true, webViewLink: linkData.webViewLink });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});