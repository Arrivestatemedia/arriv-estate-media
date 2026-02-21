import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();
    if (!bookingId) {
      return Response.json({ error: 'Missing bookingId' }, { status: 400 });
    }

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    const totalAmount = 50;
    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    const adminEmail = 'BradCBurke@arrivestatemedia.com';

    // Generate invoice number
    const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1);
    const lastNumber = allInvoices.length > 0 && allInvoices[0].invoice_number
      ? parseInt(allInvoices[0].invoice_number) : 1000;
    const invoiceNumber = String(lastNumber + 1);

    // Create Stripe payment link
    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `Booking Deposit - ${booking.street_address}`,
        'line_items[0][price_data][unit_amount]': '5000',
        'line_items[0][quantity]': '1',
      }),
    });
    const stripeData = await stripeResponse.json();
    if (!stripeResponse.ok) throw new Error(`Stripe error: ${stripeData.error?.message}`);
    const stripeUrl = stripeData.url;

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
    } catch (e) {
      console.warn('Logo fetch failed:', e.message);
    }

    // Generate PDF
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

    // DEPOSIT INVOICE title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(26, 26, 26);
    doc.text('DEPOSIT INVOICE', margin, curY);
    curY += 18;

    // Invoice # and Date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Invoice #: ${invoiceNumber}`, margin, curY);
    curY += 14;
    doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' })}`, margin, curY);
    curY += 26;

    // BILL TO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('BILL TO:', margin, curY);
    curY += 15;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(booking.client_name, margin, curY);
    curY += 17;

    doc.setTextColor(184, 149, 106);
    doc.text('Listing Address:', margin, curY);
    curY += 15;

    doc.setTextColor(80, 80, 80);
    doc.text(propertyAddress, margin, curY);
    curY += 15;
    doc.text(`Service Date: ${booking.preferred_date}`, margin, curY);

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

    const packagePrices = { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 };
    const pkgNames = { mls_walkthrough: 'MLS Walkthrough', photo_essentials: 'Photo Essentials Package', photo_cinematic: 'Photo + Cinematic Walkthrough', premium_bundle: 'Premium Bundle Package' };
    const addonPrices = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
    const addonDescriptions = { drone: 'Drone Photography', '3d_tour': '3D Virtual Tour', twilight: 'Twilight Photography', rush_delivery: 'Rush Delivery', vertical_reel: 'Vertical Reel', ai_staging: 'AI Staging' };

    const basePkgAmount = packagePrices[booking.package] || 0;
    const addOns = booking.add_ons || [];

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    let y = curY;
    doc.text(pkgNames[booking.package] || booking.package, margin, y);
    doc.text(`$${basePkgAmount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
    y += 18;

    for (const addon of addOns) {
      const price = addonPrices[addon] || 0;
      doc.text(addonDescriptions[addon] || addon, margin, y);
      doc.text(`$${price.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
      y += 18;
    }

    // Total
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 26);
    doc.text('TOTAL DUE:', margin, y);
    doc.setTextColor(184, 149, 106);
    doc.text(`$${totalAmount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
    y += 30;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // PAYMENT INSTRUCTIONS
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('PAYMENT INSTRUCTIONS', margin, y);
    y += 16;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('Full deposit payment is required for your shoot to be confirmed.', margin, y);
    y += 16;

    const linkLabel = 'Payment Link: ';
    doc.text(linkLabel, margin, y);
    const labelWidth = doc.getTextWidth(linkLabel);
    doc.setTextColor(184, 149, 106);
    doc.textWithLink(stripeUrl, margin + labelWidth, y, { url: stripeUrl });

    // Footer
    doc.setFillColor(26, 26, 26);
    doc.rect(0, pageHeight - 55, pageWidth, 55, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(184, 149, 106);
    doc.text('Arriv Estate Media LLC | Professional Property Photography & Videography', pageWidth / 2, pageHeight - 28, { align: 'center' });

    const pdfBytes = new Uint8Array(doc.output('arraybuffer'));
    console.log('Deposit invoice PDF generated, size:', pdfBytes.length);

    // Upload to Google Drive UNPAID folder
    const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    const unpaidFolderId = '1PMtihUlPa_LRcxYdi4ZDNeWWF2zfdv7J';
    const enc = new TextEncoder();
    const boundary = 'boundary_arriv_deposit';
    const pdfFileName = `DepositInvoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;
    const pdfMetadata = JSON.stringify({ name: pdfFileName, parents: [unpaidFolderId], mimeType: 'application/pdf' });
    const pdfBefore = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${pdfMetadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`);
    const pdfAfter = enc.encode(`\r\n--${boundary}--`);
    const pdfUploadBody = new Uint8Array(pdfBefore.length + pdfBytes.length + pdfAfter.length);
    pdfUploadBody.set(pdfBefore);
    pdfUploadBody.set(pdfBytes, pdfBefore.length);
    pdfUploadBody.set(pdfAfter, pdfBefore.length + pdfBytes.length);

    const pdfUploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body: pdfUploadBody
    });
    const uploadedPdf = await pdfUploadRes.json();
    if (!pdfUploadRes.ok) throw new Error(`Drive upload failed: ${JSON.stringify(uploadedPdf.error)}`);
    const pdfFileId = uploadedPdf.id;
    console.log('Deposit invoice uploaded to Drive:', pdfFileId);

    // Make public
    await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
      headers: { 'Authorization': `Bearer ${driveToken}` }
    });
    const { webViewLink: driveViewLink } = await fileDetailsRes.json();
    console.log('Drive link:', driveViewLink);

    // Send invoice email via Brevo
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const firstName = booking.client_name.split(' ')[0];
    const htmlEmailBody = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Your deposit invoice for media services at <strong>${propertyAddress}</strong> is ready. Please use the link below to view your invoice and submit payment at your convenience.</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${driveViewLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">👉 View Invoice</a>
  </p>
  <p>If you have any questions, feel free to reach out.</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body></html>`;

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
        to: [{ email: booking.client_email, name: booking.client_name }],
        subject: 'Your Deposit Invoice from Arriv Estate Media',
        htmlContent: htmlEmailBody
      })
    });
    if (!brevoRes.ok) {
      const brevoErr = await brevoRes.json();
      throw new Error(`Brevo error: ${brevoErr.message}`);
    }
    console.log('Deposit invoice email sent');

    // Create invoice record
    const invoice = await base44.asServiceRole.entities.Invoice.create({
      invoice_number: invoiceNumber,
      invoice_type: 'deposit',
      booking_id: bookingId,
      client_name: booking.client_name,
      client_email: booking.client_email,
      job_address: propertyAddress,
      service_date: booking.preferred_date,
      package: booking.package,
      add_ons: addOns,
      amount: totalAmount,
      payment_status: 'unpaid',
      stripe_payment_link_id: stripeData.id,
      stripe_payment_link_url: stripeData.url,
      google_drive_unpaid_url: driveViewLink,
      google_drive_file_id: pdfFileId,
      pay_at_closing: true,
      email_sent_at: new Date().toISOString()
    });

    // Update booking with invoice ID and lock
    await base44.asServiceRole.entities.Booking.update(bookingId, {
      invoice_id: invoice.id,
      payment_locked: true
    });

    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'email', recipient_type: 'client',
      recipient_email: booking.client_email,
      message_content: `Deposit Invoice #${invoiceNumber} sent for ${propertyAddress}`,
      subject: 'Your Deposit Invoice from Arriv Estate Media',
      status: 'success'
    });

    return Response.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber,
      stripeLink: stripeData.url,
      driveViewLink
    });

  } catch (error) {
    console.error('Error generating deposit invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});