import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { invoiceId } = await req.json();
    if (!invoiceId) return Response.json({ error: 'invoiceId required' }, { status: 400 });

    const invoice = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    const inv = invoice[0];
    if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    // Also fetch the scheduled booking to get package_features and custom price
    const scheduledBookings = await base44.asServiceRole.entities.ScheduledBooking.filter({ submitted_booking_id: inv.booking_id });
    const sb = scheduledBookings[0];

    const adminEmail = 'BradCBurke@arrivestatemedia.com';
    const propertyAddress = inv.job_address;
    const packagePrices = { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 };
    const addOnPrices = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
    const pkgPrice = sb?.custom_package_price != null ? sb.custom_package_price : (packagePrices[inv.package] || 0);
    const totalPrice = inv.amount;
    const packageFeatures = sb?.package_features || [];

    // Generate PDF
    const { jsPDF } = await import('npm:jspdf@2.5.1');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 60;

    doc.setFillColor(255, 251, 245);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Fetch logo
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
    } catch (e) { /* skip */ }

    const logoH = 175;
    let curY = 0;
    if (logoBase64) {
      const imgData = `data:image/png;base64,${logoBase64}`;
      const imgProps = doc.getImageProperties(imgData);
      const logoW = (imgProps.width / imgProps.height) * logoH;
      doc.addImage(imgData, 'PNG', (pageWidth - logoW) / 2, curY, logoW, logoH);
      curY += logoH - 55;
    } else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(26, 26, 26);
      doc.text('ARRIV', pageWidth / 2, curY + 30, { align: 'center' });
      curY += 60;
    }

    doc.setDrawColor(184, 149, 106); doc.setLineWidth(1);
    doc.line(margin, curY, pageWidth - margin, curY); curY += 50;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(26, 26, 26);
    doc.text('INVOICE', margin, curY); curY += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(80, 80, 80);
    doc.text(`Invoice #: ${inv.invoice_number}`, margin, curY); curY += 14;
    doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`, margin, curY); curY += 26;

    doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
    doc.text('BILL TO:', margin, curY); curY += 15;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text(inv.client_name, margin, curY); curY += 17;
    doc.setTextColor(184, 149, 106); doc.text('Listing Address:', margin, curY); curY += 15;
    doc.setTextColor(80, 80, 80); doc.text(propertyAddress, margin, curY); curY += 15;
    doc.text(`Service Date: ${inv.service_date}`, margin, curY); curY += 20;

    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
    doc.line(margin, curY, pageWidth - margin, curY); curY += 20;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(184, 149, 106);
    doc.text('SERVICES PROVIDED', margin, curY); curY += 10;
    doc.setDrawColor(200, 200, 200); doc.line(margin, curY, pageWidth - margin, curY); curY += 13;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
    doc.text('Description', margin, curY); doc.text('Amount', pageWidth - margin, curY, { align: 'right' }); curY += 7;
    doc.line(margin, curY, pageWidth - margin, curY); curY += 15;

    const pkgNames = { mls_walkthrough: 'MLS Walkthrough', photo_essentials: 'Photo Essentials Package', photo_cinematic: 'Photo + Cinematic Walkthrough', premium_bundle: 'Premium Bundle Package' };
    const addonDesc = { drone: 'Drone Photography', '3d_tour': '3D Virtual Tour', twilight: 'Twilight Photography', rush_delivery: 'Rush Delivery', vertical_reel: 'Vertical Reel', ai_staging: 'AI Staging' };

    doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text(pkgNames[inv.package] || inv.package, margin, curY);
    doc.text(`$${pkgPrice.toFixed(2)}`, pageWidth - margin, curY, { align: 'right' }); curY += 16;

    if (packageFeatures.length > 0) {
      doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      for (const f of packageFeatures) { doc.text(`  • ${f}`, margin + 8, curY); curY += 12; }
      doc.setFontSize(10); doc.setTextColor(80, 80, 80);
    }
    curY += 4;

    for (const addon of (inv.add_ons || [])) {
      doc.text(addonDesc[addon] || addon, margin, curY);
      doc.text(`$${(addOnPrices[addon] || 0).toFixed(2)}`, pageWidth - margin, curY, { align: 'right' }); curY += 18;
    }

    doc.setDrawColor(200, 200, 200); doc.line(margin, curY, pageWidth - margin, curY); curY += 14;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26); doc.text('TOTAL DUE:', margin, curY);
    doc.setTextColor(184, 149, 106); doc.text(`$${totalPrice.toFixed(2)}`, pageWidth - margin, curY, { align: 'right' }); curY += 30;
    doc.setDrawColor(200, 200, 200); doc.line(margin, curY, pageWidth - margin, curY); curY += 20;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 26, 26);
    doc.text('PAYMENT INSTRUCTIONS', margin, curY); curY += 16;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('Full payment is required for your shoot to be confirmed.', margin, curY); curY += 16;
    const linkLabel = 'Payment Link: ';
    doc.text(linkLabel, margin, curY);
    const labelWidth = doc.getTextWidth(linkLabel);
    doc.setTextColor(184, 149, 106);
    doc.textWithLink(inv.stripe_payment_link_url, margin + labelWidth, curY, { url: inv.stripe_payment_link_url });

    const refundText = "Arriv Estate Media LLC is committed to delivering high-quality media and offers revisions or reshoots when necessary to meet expectations. Due to the time and production involved, completed services are generally non-refundable. However, partial refunds may be issued at ARRIV's discretion.";
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
    const refundLines = doc.splitTextToSize(refundText, pageWidth - margin * 2);
    const refundBlockHeight = refundLines.length * 9 + 14;
    const refundY = pageHeight - 55 - 10 - refundBlockHeight;
    doc.setFont('helvetica', 'bold'); doc.text('*Refund Policy', margin, refundY);
    doc.setFont('helvetica', 'normal'); doc.text(refundLines, margin, refundY + 12);

    doc.setFillColor(26, 26, 26); doc.rect(0, pageHeight - 55, pageWidth, 55, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(184, 149, 106);
    doc.text('Arriv Estate Media LLC | Professional Property Photography & Videography', pageWidth / 2, pageHeight - 28, { align: 'center' });

    const pdfBytes = new Uint8Array(doc.output('arraybuffer'));

    // Upload new PDF to Drive (overwrite existing file)
    const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    const enc = new TextEncoder();
    const boundary = 'boundary_arriv_invoice';
    const pdfFileName = `Invoice_${inv.invoice_number}_${inv.client_name.replace(/\s+/g, '_')}.pdf`;

    let driveViewLink = inv.google_drive_unpaid_url;
    let pdfFileId = inv.google_drive_file_id;

    if (pdfFileId) {
      // Update existing file content
      const pdfMetadata = JSON.stringify({ name: pdfFileName, mimeType: 'application/pdf' });
      const pdfBefore = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${pdfMetadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`);
      const pdfAfter = enc.encode(`\r\n--${boundary}--`);
      const pdfUploadBody = new Uint8Array(pdfBefore.length + pdfBytes.length + pdfAfter.length);
      pdfUploadBody.set(pdfBefore); pdfUploadBody.set(pdfBytes, pdfBefore.length); pdfUploadBody.set(pdfAfter, pdfBefore.length + pdfBytes.length);

      const updateRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${pdfFileId}?uploadType=multipart`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body: pdfUploadBody
      });
      const updateData = await updateRes.json();
      if (!updateRes.ok) throw new Error(`Drive update failed: ${JSON.stringify(updateData.error)}`);

      const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, { headers: { 'Authorization': `Bearer ${driveToken}` } });
      const fileDetails = await fileDetailsRes.json();
      driveViewLink = fileDetails.webViewLink;
    } else {
      // Upload new file
      const unpaidFolderId = '1PMtihUlPa_LRcxYdi4ZDNeWWF2zfdv7J';
      const pdfMetadata = JSON.stringify({ name: pdfFileName, parents: [unpaidFolderId], mimeType: 'application/pdf' });
      const pdfBefore = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${pdfMetadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`);
      const pdfAfter = enc.encode(`\r\n--${boundary}--`);
      const pdfUploadBody = new Uint8Array(pdfBefore.length + pdfBytes.length + pdfAfter.length);
      pdfUploadBody.set(pdfBefore); pdfUploadBody.set(pdfBytes, pdfBefore.length); pdfUploadBody.set(pdfAfter, pdfBefore.length + pdfBytes.length);
      const pdfUploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body: pdfUploadBody
      });
      const uploadedPdf = await pdfUploadRes.json();
      if (!pdfUploadRes.ok) throw new Error(`PDF upload failed: ${JSON.stringify(uploadedPdf.error)}`);
      pdfFileId = uploadedPdf.id;
      await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      });
      const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, { headers: { 'Authorization': `Bearer ${driveToken}` } });
      const fileDetails = await fileDetailsRes.json();
      driveViewLink = fileDetails.webViewLink;
    }

    // Send invoice email via Brevo
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const firstName = inv.client_name.split(' ')[0];
    const htmlEmailBody = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;"><p>Hi ${firstName},</p><p>Your invoice for media services at <strong>${propertyAddress}</strong> is ready. Please use the link below to view your invoice and submit payment at your convenience.</p><p style="text-align: center; margin: 30px 0;"><a href="${driveViewLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">👉 View Invoice</a></p><p>If you have any questions, feel free to reach out.</p><p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p></body></html>`;

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
        to: [{ email: inv.client_email, name: inv.client_name }],
        subject: 'Your Invoice from Arriv Estate Media',
        htmlContent: htmlEmailBody
      })
    });
    const brevoData = await brevoRes.json();
    if (!brevoRes.ok) throw new Error(`Brevo error: ${brevoData.message || JSON.stringify(brevoData)}`);

    // Update invoice with new drive link and email timestamp
    await base44.asServiceRole.entities.Invoice.update(invoiceId, {
      google_drive_unpaid_url: driveViewLink,
      google_drive_file_id: pdfFileId,
      email_sent_at: new Date().toISOString()
    });

    return Response.json({ success: true, driveViewLink, messageId: brevoData.messageId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});