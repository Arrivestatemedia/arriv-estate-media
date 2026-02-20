import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceId } = await req.json();

    const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];

    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Only handle pay-at-closing deposit invoices
    if (!invoice.pay_at_closing || invoice.invoice_type !== 'deposit') {
      return Response.json({ error: 'Not a pay-at-closing deposit invoice' }, { status: 400 });
    }

    const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Folder IDs
    const unpaidFolderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';          // UNPAID - delete from here
    const unpaidArchivesFolderId = '1D1tR0i_1JGj_wKvQJYNfJZ-kKNNjxXV8'; // UNPAID ARCHIVES - move deposit invoice here
    const receiptsFolderId = '1Jwc1L00KV-lseq1kGEo8jcN5sTJ9LoOt';       // PAID RECEIPTS - upload receipt here

    // ── 1. GENERATE RECEIPT PDF (internal, deposit received) ─────────────────
    let logoBase64 = null;
    try {
      const logoRes = await fetch('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png');
      if (logoRes.ok) {
        const logoBuffer = await logoRes.arrayBuffer();
        const logoBytes = new Uint8Array(logoBuffer);
        let b64 = '';
        const chunkSize = 1024;
        for (let i = 0; i < logoBytes.length; i += chunkSize) {
          b64 += String.fromCharCode(...logoBytes.subarray(i, i + chunkSize));
        }
        logoBase64 = btoa(b64);
      }
    } catch (e) {
      console.warn('Logo fetch failed:', e.message);
    }

    const { jsPDF } = await import('npm:jspdf@2.5.1');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 60;

    // Cream background
    doc.setFillColor(255, 251, 245);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Logo
    const logoH = 175;
    let curY = 0;
    if (logoBase64) {
      const imgData = `data:image/png;base64,${logoBase64}`;
      const imgProps = doc.getImageProperties(imgData);
      const logoW = (imgProps.width / imgProps.height) * logoH;
      doc.addImage(imgData, 'PNG', (pageWidth - logoW) / 2, curY, logoW, logoH);
      curY += logoH - 55;
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(26, 26, 26);
      doc.text('ARRIV', pageWidth / 2, curY + 30, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(184, 149, 106);
      doc.text('ESTATE MEDIA', pageWidth / 2, curY + 46, { align: 'center' });
      curY += 60;
    }

    // Gold divider
    doc.setDrawColor(184, 149, 106);
    doc.setLineWidth(1);
    doc.line(margin, curY, pageWidth - margin, curY);
    curY += 50;

    // RECEIPT title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(26, 26, 26);
    doc.text('RECEIPT', margin, curY);
    curY += 18;

    // Receipt # and Date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Receipt #: ${invoice.invoice_number}`, margin, curY);
    curY += 14;
    const paidDate = invoice.paid_at ? new Date(invoice.paid_at) : new Date();
    doc.text(`Date: ${paidDate.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' })}`, margin, curY);
    curY += 26;

    // BILLED TO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('BILLED TO:', margin, curY);
    curY += 15;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(invoice.client_name, margin, curY);
    curY += 17;

    doc.setTextColor(184, 149, 106);
    doc.text('Listing Address:', margin, curY);
    curY += 15;

    doc.setTextColor(80, 80, 80);
    doc.text(invoice.job_address, margin, curY);
    curY += 15;
    doc.text(`Service Date: ${invoice.service_date}`, margin, curY);

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    curY += 20;
    doc.line(margin, curY, pageWidth - margin, curY);
    curY += 20;

    // SERVICES PROVIDED
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(184, 149, 106);
    doc.text('SERVICES PROVIDED', margin, curY);
    curY += 10;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, curY, pageWidth - margin, curY);
    curY += 13;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('Description', margin, curY);
    doc.text('Amount', pageWidth - margin, curY, { align: 'right' });
    curY += 7;
    doc.line(margin, curY, pageWidth - margin, curY);
    curY += 15;

    // Line items
    const addonPrices = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
    const addonDescriptions = { drone: 'Drone Photography', '3d_tour': '3D Virtual Tour', twilight: 'Twilight Photography', rush_delivery: 'Rush Delivery', vertical_reel: 'Vertical Reel', ai_staging: 'AI Staging' };
    const pkgNames = { mls_walkthrough: 'MLS Walkthrough', photo_essentials: 'Photo Essentials Package', photo_cinematic: 'Photo + Cinematic Walkthrough', premium_bundle: 'Premium Bundle Package' };

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    let y = curY;
    doc.text('Booking Deposit', margin, y);
    doc.text('$50.00', pageWidth - margin, y, { align: 'right' });
    y += 18;

    // Total paid
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 26);
    doc.text('TOTAL PAID:', margin, y);
    doc.setTextColor(184, 149, 106);
    doc.text('$50.00', pageWidth - margin, y, { align: 'right' });
    y += 30;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // Thank you message
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('Thank you for your payment. Your booking has been confirmed.', margin, y);
    y += 15;
    doc.text('Balance is due at closing upon successful sale of the property.', margin, y);

    // Footer
    y = pageHeight - 40;
    doc.setFontSize(9);
    doc.setTextColor(184, 149, 106);
    doc.text('Arriv Estate Media LLC', pageWidth / 2, y, { align: 'center' });
    y += 12;
    doc.setTextColor(120, 120, 120);
    doc.text('Thank you for choosing Arriv Estate Media', pageWidth / 2, y, { align: 'center' });

    const receiptPDF = doc.output('arraybuffer');
    console.log('[INFO] Receipt PDF generated, size:', receiptPDF.byteLength);

    // ── 2. UPLOAD RECEIPT TO GOOGLE DRIVE (PAID RECEIPTS) ───────────────────
    const receiptFormData = new FormData();
    receiptFormData.append('file', new Blob([receiptPDF], { type: 'application/pdf' }), `Deposit_Receipt_${invoice.invoice_number}.pdf`);
    receiptFormData.append('parents', JSON.stringify([receiptsFolderId]));

    const driveUploadRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${driveToken}`
      },
      body: receiptFormData
    });

    const driveUploadData = await driveUploadRes.json();
    if (!driveUploadData.id) {
      throw new Error('Failed to upload receipt to Drive: ' + JSON.stringify(driveUploadData));
    }
    console.log('[INFO] Receipt uploaded:', driveUploadData.id);

    const receiptDriveLink = `https://drive.google.com/file/d/${driveUploadData.id}/view?usp=drivesdk`;
    console.log('[INFO] Receipt Drive link:', receiptDriveLink);

    // ── 3. GENERATE UPDATED INVOICE (with deposit received) ────────────────
    const updatedInvoiceHTML = await base44.asServiceRole.functions.invoke('generatePayAtClosingDepositInvoicePDF', {
      invoiceNumber: invoice.invoice_number,
      clientName: invoice.client_name,
      jobAddress: invoice.job_address,
      serviceDate: invoice.service_date,
      packageName: invoice.package,
      addOns: invoice.add_ons || [],
      packageMinimum: invoice.package_minimum || 0,
      payAtClosingRate: invoice.pay_at_closing_rate || 0.0008,
      stripeUrl: '',
      isDepositReceived: true
    });

    const invoiceHTML = updatedInvoiceHTML.data?.html;
    if (!invoiceHTML) {
      throw new Error('Failed to generate updated invoice HTML');
    }

    // Convert HTML to PDF
    const htmlToPdfRes = await fetch('https://api.html2pdf.com/v1/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: invoiceHTML })
    }).catch(() => null);

    let updatedInvoicePDF = null;
    if (htmlToPdfRes && htmlToPdfRes.ok) {
      const pdfData = await htmlToPdfRes.arrayBuffer();
      updatedInvoicePDF = pdfData;
    } else {
      // Fallback: use html2canvas + jsPDF
      console.warn('HTML to PDF service failed, using fallback');
      // For now, we'll skip updating the invoice in Drive and just send email
    }

    // ── 4. EMAIL UPDATED INVOICE TO CLIENT ────────────────────────────────
    await base44.asServiceRole.functions.invoke('sendReceiptToClient', {
      invoiceId: invoice.id,
      clientEmail: invoice.client_email,
      clientName: invoice.client_name.split(' ')[0],
      jobAddress: invoice.job_address,
      isDepositReceived: true
    });

    // ── 5. MOVE ORIGINAL DEPOSIT INVOICE TO UNPAID ARCHIVES ────────────────
    // Find the file in UNPAID folder
    const unpaidFilesRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=parents='${unpaidFolderId}' and name contains '${invoice.invoice_number}'&spaces=drive&pageSize=10&supportsAllDrives=true`,
      {
        headers: { 'Authorization': `Bearer ${driveToken}` }
      }
    );
    const unpaidFiles = await unpaidFilesRes.json();

    if (unpaidFiles.files && unpaidFiles.files.length > 0) {
      const fileId = unpaidFiles.files[0].id;
      
      // Move to archives
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${driveToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parents: [unpaidArchivesFolderId]
        })
      });

      console.log('[INFO] Deposit invoice moved to Unpaid Archives');
    }

    // ── 6. UPDATE INVOICE STATUS ─────────────────────────────────────────
    await base44.asServiceRole.entities.Invoice.update(invoiceId, {
      payment_status: 'paid',
      paid_at: new Date().toISOString()
    });

    return Response.json({
      success: true,
      receiptDriveLink,
      message: 'Deposit payment processed successfully'
    });

  } catch (error) {
    console.error('Error processing deposit payment:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});