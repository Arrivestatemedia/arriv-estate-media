import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { bookingId, booking, total_price } = await req.json();

    if (!booking || !bookingId || !total_price) {
      return Response.json({ error: 'Missing required data' }, { status: 400 });
    }

    const totalAmount = parseFloat(total_price);

    // Generate invoice number
    const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1);
    const lastNumber = allInvoices.length > 0 && allInvoices[0].invoice_number 
      ? parseInt(allInvoices[0].invoice_number) 
      : 1000;
    const invoiceNumber = String(lastNumber + 1);

    // Use $1 for test accounts
    const testEmails = ['bradcburke@gmail.com', 'bradcburke5@gmail.com'];
    const isTestAccount = testEmails.includes(booking.client_email.toLowerCase()) || booking.client_email.toLowerCase().includes('test-user');
    const chargeAmount = isTestAccount ? 1 : totalAmount;
    const stripeAmount = Math.round(chargeAmount * 100);

    // Create Stripe payment link
    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `Media Services - ${booking.street_address}`,
        'line_items[0][price_data][unit_amount]': String(stripeAmount),
        'line_items[0][quantity]': '1',
      }),
    });

    const stripeData = await stripeResponse.json();
    if (!stripeResponse.ok) {
      throw new Error(`Stripe error: ${stripeData.error?.message || 'Unknown error'}`);
    }

    const packagePrices = {
      'mls_walkthrough': 100,
      'photo_essentials': 275,
      'photo_cinematic': 475,
      'premium_bundle': 675
    };

    const pkgNames = {
      'mls_walkthrough': 'MLS Walkthrough',
      'photo_essentials': 'Photo Essentials Package',
      'photo_cinematic': 'Photo + Cinematic Walkthrough',
      'premium_bundle': 'Premium Bundle Package'
    };

    const packageInclusions = {
      'mls_walkthrough': [
        '2-3 minute unbranded MLS-ready walkthrough',
      ],
      'photo_essentials': [
        '25-50 edited photos (interior + exterior)',
      ],
      'photo_cinematic': [
        '2-3 minute unbranded MLS-ready walkthrough',
        '25-50 edited photos (interior + exterior)',
      ],
      'premium_bundle': [
        'Twilight exterior edits (up to 5 photos)',
        'AI Staging',
        '2-3 minute unbranded MLS-ready walkthrough',
        '50-150 edited photos (interior + exterior)',
        '2 vertical reels',
        'Drone',
      ]
    };

    const addonPrices = {
      'drone': 125,
      '3d_tour': 125,
      'twilight': 125,
      'rush_delivery': 100,
      'vertical_reel': 40,
      'ai_staging': 125
    };

    const addonDescriptions = {
      'drone': 'Drone Photography',
      '3d_tour': '3D Virtual Tour',
      'twilight': 'Twilight Photography',
      'rush_delivery': 'Rush Delivery',
      'vertical_reel': 'Vertical Reel',
      'ai_staging': 'AI Staging'
    };

    const jobAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    const addOns = booking.add_ons || [];

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

    // Generate PDF using jsPDF (same as deposit/pay-at-closing invoices)
    console.log('Generating invoice PDF...');
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

    // INVOICE title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(26, 26, 26);
    doc.text('INVOICE', margin, curY);
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
    doc.text(jobAddress, margin, curY);
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

    // Package row
    const basePkgAmount = packagePrices[booking.package] || 0;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(pkgNames[booking.package] || booking.package, margin, curY);
    doc.text(`$${chargeAmount.toFixed(2)}`, pageWidth - margin, curY, { align: 'right' });
    curY += 16;

    // Package inclusions as bullet points
    const inclusions = packageInclusions[booking.package] || [];
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    for (const item of inclusions) {
      doc.text(`  • ${item}`, margin + 5, curY);
      curY += 13;
    }

    // Add-on bullet points (included in package price for pay-up-front)
    for (const addon of addOns) {
      doc.text(`  • ${addonDescriptions[addon] || addon}`, margin + 5, curY);
      curY += 13;
    }

    // Total row
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, curY + 5, pageWidth - margin, curY + 5);
    curY += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('TOTAL DUE:', margin, curY);
    doc.setTextColor(184, 149, 106);
    doc.text(`$${chargeAmount.toFixed(2)}`, pageWidth - margin, curY, { align: 'right' });
    curY += 30;

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, curY, pageWidth - margin, curY);
    curY += 20;

    // PAYMENT INSTRUCTIONS
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('PAYMENT INSTRUCTIONS', margin, curY);
    curY += 16;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('Full payment is required for your shoot to be confirmed.', margin, curY);
    curY += 16;

    const linkLabel = 'Payment Link: ';
    doc.text(linkLabel, margin, curY);
    const labelWidth = doc.getTextWidth(linkLabel);
    doc.setTextColor(184, 149, 106);
    doc.textWithLink(stripeData.url, margin + labelWidth, curY, { url: stripeData.url });

    // Dark footer bar
    doc.setFillColor(26, 26, 26);
    doc.rect(0, pageHeight - 55, pageWidth, 55, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(184, 149, 106);
    doc.text('Arriv Estate Media LLC | Professional Property Photography & Videography', pageWidth / 2, pageHeight - 28, { align: 'center' });

    const pdfBytes = new Uint8Array(doc.output('arraybuffer'));
    console.log('PDF generated, size:', pdfBytes.length);

    // Upload PDF to Google Drive
    console.log('Uploading to Google Drive...');
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    const unpaidFolderId = '1PMtihUlPa_LRcxYdi4ZDNeWWF2zfdv7J';
    const fileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;
    const boundary = 'boundary_arriv_invoice';
    const metadata = JSON.stringify({ name: fileName, parents: [unpaidFolderId] });

    const enc = new TextEncoder();
    const before = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`);
    const after = enc.encode(`\r\n--${boundary}--`);
    const uploadBody = new Uint8Array(before.length + pdfBytes.length + after.length);
    uploadBody.set(before);
    uploadBody.set(pdfBytes, before.length);
    uploadBody.set(after, before.length + pdfBytes.length);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body: uploadBody
    });

    const uploadedFile = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(`Drive upload failed: ${uploadedFile.error?.message}`);

    const pdfFileId = uploadedFile.id;
    console.log('Uploaded file ID:', pdfFileId);

    await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const { webViewLink: driveViewLink } = await fileDetailsRes.json();

    // Send invoice email via Brevo
    console.log('Sending invoice email...');
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');
    const firstName = booking.client_name.split(' ')[0];

    const htmlEmailBody = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Your invoice for media services at <strong>${jobAddress}</strong> is ready. Please use the link below to view your invoice and submit payment at your convenience.</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${driveViewLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
      👉 View Invoice
    </a>
  </p>
  <p>If you have any questions, feel free to reach out.</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body>
</html>`;

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
        to: [{ email: booking.client_email, name: booking.client_name }],
        subject: 'Your Invoice from Arriv Estate Media',
        htmlContent: htmlEmailBody
      })
    });

    const brevoData = await brevoResponse.json();
    if (!brevoResponse.ok) throw new Error(`Brevo error: ${brevoData.message}`);
    console.log('Email sent, messageId:', brevoData.messageId);

    // Create invoice record
    const invoice = await base44.asServiceRole.entities.Invoice.create({
      invoice_number: invoiceNumber,
      invoice_type: 'pay_up_front',
      booking_id: bookingId,
      client_name: booking.client_name,
      client_email: booking.client_email,
      job_address: jobAddress,
      service_date: booking.preferred_date,
      package: booking.package,
      add_ons: addOns,
      amount: chargeAmount,
      payment_status: 'unpaid',
      stripe_payment_link_id: stripeData.id,
      stripe_payment_link_url: stripeData.url,
      google_drive_unpaid_url: driveViewLink,
      google_drive_file_id: pdfFileId,
      pay_at_closing: false,
      email_sent_at: new Date().toISOString()
    });

    await base44.asServiceRole.entities.Booking.update(bookingId, {
      invoice_id: invoice.id
    });

    return Response.json({ 
      success: true, 
      invoiceId: invoice.id,
      invoiceNumber,
      stripeLink: stripeData.url,
      driveViewLink
    });

  } catch (error) {
    console.error('Error generating invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});