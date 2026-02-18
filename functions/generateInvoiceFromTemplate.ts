import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb, PDFPage } from 'npm:pdf-lib@^1.17.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const {
      invoiceNumber,
      clientName,
      clientEmail,
      jobAddress,
      amountDue,
      packageName,
      addOns,
      bookingId,
      jobId,
      stripePaymentLink,
      packageAmount
    } = await req.json();

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    const unpaindFolderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';

    // Step 1: Generate PDF using pdf-lib
    console.log('Step 1: Generating invoice PDF...');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size

    const fontSize = 12;
    const smallFontSize = 10;
    const titleFontSize = 18;
    const gold = rgb(0.72, 0.59, 0.42); // #B8956A
    const black = rgb(0.1, 0.1, 0.1);

    let yPosition = 750;

    // Header with logo area
    page.drawText('ARRIV ESTATE MEDIA', {
      x: 50,
      y: yPosition,
      size: titleFontSize,
      color: gold,
      maxWidth: 500,
    });
    yPosition -= 30;

    page.drawText('INVOICE', {
      x: 50,
      y: yPosition,
      size: 14,
      color: black,
    });

    page.drawText(`#${invoiceNumber}`, {
      x: 480,
      y: yPosition,
      size: 14,
      color: black,
    });
    yPosition -= 25;

    // Divider line
    page.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: 562, y: yPosition },
      thickness: 1,
      color: gold,
    });
    yPosition -= 20;

    // Invoice date
    const invoiceDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    page.drawText(`Date: ${invoiceDate}`, {
      x: 50,
      y: yPosition,
      size: smallFontSize,
      color: black,
    });
    yPosition -= 15;

    // Bill To section
    page.drawText('BILL TO:', {
      x: 50,
      y: yPosition,
      size: 10,
      color: gold,
    });
    yPosition -= 15;

    page.drawText(clientName, {
      x: 50,
      y: yPosition,
      size: fontSize,
      color: black,
    });
    yPosition -= 15;

    page.drawText(jobAddress, {
      x: 50,
      y: yPosition,
      size: fontSize,
      color: black,
      maxWidth: 400,
    });
    yPosition -= 25;

    // Services section
    page.drawText('SERVICES', {
      x: 50,
      y: yPosition,
      size: 10,
      color: gold,
    });
    yPosition -= 15;

    // Format add-ons
    const addonDescriptions = {
      'drone': 'Drone Photography',
      '3d_tour': '3D Virtual Tour',
      'twilight': 'Twilight Photography',
      'rush_delivery': 'Rush Delivery',
      'vertical_reel': 'Vertical Reel',
      'ai_staging': 'AI Staging'
    };

    const packageNames = {
      'mls_walkthrough': 'MLS Walkthrough',
      'photo_essentials': 'Photo Essentials',
      'photo_cinematic': 'Photo + Cinematic Walkthrough',
      'premium_bundle': 'Premium Media Bundle'
    };

    const basePkgAmount = packageAmount || 0;

    page.drawText(packageNames[packageName] || packageName, {
      x: 50,
      y: yPosition,
      size: fontSize,
      color: black,
    });
    page.drawText(`$${basePkgAmount.toFixed(2)}`, {
      x: 480,
      y: yPosition,
      size: fontSize,
      color: black,
    });
    yPosition -= 15;

    // Add-ons
    if (addOns && addOns.length > 0) {
      addOns.forEach(addon => {
        const addonName = addonDescriptions[addon] || addon;
        page.drawText(`  + ${addonName}`, {
          x: 50,
          y: yPosition,
          size: smallFontSize,
          color: black,
        });
        yPosition -= 12;
      });
    }

    yPosition -= 15;

    // Divider line
    page.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: 562, y: yPosition },
      thickness: 1,
      color: gold,
    });
    yPosition -= 20;

    // Total
    page.drawText('AMOUNT DUE', {
      x: 50,
      y: yPosition,
      size: 11,
      color: gold,
    });
    page.drawText(`$${parseFloat(amountDue).toFixed(2)}`, {
      x: 480,
      y: yPosition,
      size: 16,
      color: black,
    });
    yPosition -= 40;

    // Payment link section
    if (stripePaymentLink) {
      page.drawText('PAYMENT', {
        x: 50,
        y: yPosition,
        size: 10,
        color: gold,
      });
      yPosition -= 15;

      page.drawText('Please use the link below to submit payment:', {
        x: 50,
        y: yPosition,
        size: smallFontSize,
        color: black,
        maxWidth: 400,
      });
      yPosition -= 15;

      page.drawText(stripePaymentLink, {
        x: 50,
        y: yPosition,
        size: 9,
        color: rgb(0, 0, 0.8),
        maxWidth: 500,
      });
      yPosition -= 30;
    }

    // Footer
    page.drawText('Thank you for your business!', {
      x: 50,
      y: 40,
      size: smallFontSize,
      color: black,
    });

    page.drawText('Arriv Estate Media | 678-242-9107 | arrivestatemedia.com', {
      x: 50,
      y: 20,
      size: 9,
      color: rgb(0.4, 0.4, 0.4),
    });

    const pdfBytes = await pdfDoc.save();
    console.log('PDF generated, size:', pdfBytes.length);

    // Step 2: Upload PDF to Drive
    console.log('Step 2: Uploading PDF to Drive...');
    const fileName = `Invoice_${invoiceNumber}_${clientName.replace(/\s+/g, '_')}`;
    const pdfFileName = `${fileName}.pdf`;

    const boundary = '===============7330845974216740156==';
    const metadata = {
      name: pdfFileName,
      parents: [unpaindFolderId],
      description: `Invoice for ${clientName}`
    };
    const metadataStr = JSON.stringify(metadata);

    const parts = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadataStr,
      `--${boundary}`,
      'Content-Type: application/pdf',
      '',
    ];

    const textEncoder = new TextEncoder();
    const beforeBytes = textEncoder.encode(parts.join('\r\n'));
    const afterBytes = textEncoder.encode(`\r\n--${boundary}--`);

    const body = new Uint8Array(beforeBytes.length + pdfBytes.length + afterBytes.length);
    body.set(beforeBytes);
    body.set(new Uint8Array(pdfBytes), beforeBytes.length);
    body.set(afterBytes, beforeBytes.length + pdfBytes.length);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body: body
    });

    const uploadedFile = await uploadRes.json();
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload PDF: ${uploadedFile.error?.message}`);
    }

    const pdfFileId = uploadedFile.id;
    console.log('PDF uploaded, file ID:', pdfFileId);

    // Step 3: Make shareable and get link
    console.log('Step 3: Making file shareable...');
    const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
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

    if (!permRes.ok) {
      console.warn('Failed to set permissions (non-critical)');
    }

    const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const fileDetails = await fileDetailsRes.json();
    const driveViewLink = fileDetails.webViewLink;
    console.log('Drive view link:', driveViewLink);

    // Step 4: Send email via Brevo
    console.log('Step 4: Sending email via Brevo...');
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');

    const htmlEmailBody = `<!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <p>Hi ${clientName.split(' ')[0]},</p>

    <p>Your invoice for media services at <strong>${jobAddress}</strong> is ready. Please use the link below to view the invoice and submit payment at your convenience.</p>

    <p>
    <a href="${driveViewLink}" style="background-color: #B8956A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
      👉 View Invoice
    </a>
    </p>

    <p>If you have any questions or need anything at all, feel free to reach out. Thank you again for the opportunity to work with you.</p>

    <p>
    Best regards,<br>
    <strong>Bradley Burke</strong><br>
    Arriv Estate Media<br>
    📞 678-242-9107<br>
    🌐 arrivestatemedia.com
    </p>
    </body>
    </html>`;

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: 'Bradley Burke - Arriv Estate Media',
          email: adminEmail
        },
        to: [
          {
            email: clientEmail,
            name: clientName
          }
        ],
        subject: 'Your Invoice from Arriv Estate Media',
        htmlContent: htmlEmailBody
      })
    });

    const brevoData = await brevoResponse.json();
    console.log('Brevo response status:', brevoResponse.status);

    if (!brevoResponse.ok) {
      throw new Error(`Brevo error (${brevoResponse.status}): ${brevoData.message || JSON.stringify(brevoData)}`);
    }

    console.log('Email sent via Brevo, messageId:', brevoData.messageId);

    return Response.json({
      success: true,
      invoiceFileId: pdfFileId,
      driveViewLink,
      messageId: brevoData.messageId
    });

  } catch (error) {
    console.error('Error generating invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});