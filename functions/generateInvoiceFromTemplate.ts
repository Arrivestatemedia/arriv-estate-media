import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
    
    const templateFileId = '1Rdy5wlkeugEjNf2akpgZxwbmcDY8HzsAU95U_VIHFzk';
    const unpaindFolderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';

    // Step 1: Copy template file
    console.log('Step 1: Copying template file...');
    const fileName = `Invoice_${invoiceNumber}_${clientName.replace(/\s+/g, '_')}`;
    
    const copyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${templateFileId}/copy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: fileName,
        parents: [unpaindFolderId]
      })
    });

    const copiedDoc = await copyRes.json();
    if (!copyRes.ok) {
      throw new Error(`Failed to copy template: ${copiedDoc.error?.message}`);
    }

    const copiedDocId = copiedDoc.id;
    console.log('Copied doc ID:', copiedDocId);

    // Step 2: Replace placeholders in Google Docs
    console.log('Step 2: Replacing placeholders...');
    
    // Format service and add-ons list
    let servicesList = packageName || 'Media Services';
    if (addOns && addOns.length > 0) {
      const addonDescriptions = {
        'drone': 'Drone Photography',
        '3d_tour': '3D Virtual Tour',
        'twilight': 'Twilight Photography',
        'rush_delivery': 'Rush Delivery',
        'vertical_reel': 'Vertical Reel',
        'ai_staging': 'AI Staging'
      };
      const addonNames = addOns.map(addon => addonDescriptions[addon] || addon).join(', ');
      servicesList = `${servicesList}, ${addonNames}`;
    }

    // Calculate package amount
    const packagePrices = {
      'mls_walkthrough': 100,
      'photo_essentials': 275,
      'photo_cinematic': 475,
      'premium_bundle': 675
    };
    const basePkgAmount = packagePrices[packageName] || 0;

    const replacements = [
      {
        find: { text: '{{INVOICE_NUMBER}}' },
        replaceText: invoiceNumber
      },
      {
        find: { text: '{{NEXT_INVOICE_NUMBER}}' },
        replaceText: invoiceNumber
      },
      {
        find: { text: '{{CLIENT_NAME}}' },
        replaceText: clientName
      },
      {
        find: { text: '{{JOB_ADDRESS}}' },
        replaceText: jobAddress
      },
      {
        find: { text: '{{AMOUNT_DUE}}' },
        replaceText: `$${parseFloat(amountDue).toFixed(2)}`
      },
      {
        find: { text: '{{TOTAL_AMOUNT_OF_PACKAGE_AND_ADD-ONS}}' },
        replaceText: `$${parseFloat(amountDue).toFixed(2)}`
      },
      {
        find: { text: '{{AMOUNT_OF_PACKAGE}}' },
        replaceText: `$${basePkgAmount.toFixed(2)}`
      },
      {
        find: { text: '{{PACKAGE_NAME}}' },
        replaceText: packageName || 'Media Services'
      },
      {
        find: { text: '{{SERVICE_AND_ADD-ONS_CHOSEN}}' },
        replaceText: servicesList
      },
      {
        find: { text: '{{PLACE_STRIP_LINK}}' },
        replaceText: stripePaymentLink || ''
      },
      {
        find: { text: '{{DATE_OF_INVOICE_CREATION}}' },
        replaceText: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      }
    ];

    const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${copiedDocId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: replacements.map(r => ({
          replaceAllText: {
            containsText: r.find,
            replaceText: r.replaceText
          }
        }))
      })
    });

    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      throw new Error(`Failed to replace placeholders: ${updateData.error?.message}`);
    }

    console.log('Placeholders replaced');

    // Step 3: Export to PDF
    console.log('Step 3: Exporting to PDF...');
    const pdfUrl = `https://docs.google.com/document/d/${copiedDocId}/export?format=pdf`;
    const pdfRes = await fetch(pdfUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!pdfRes.ok) {
      throw new Error('Failed to export PDF');
    }

    const pdfBlob = await pdfRes.arrayBuffer();
    console.log('PDF exported, size:', pdfBlob.byteLength);

    // Step 4: Upload PDF to Drive
    console.log('Step 4: Uploading PDF to Drive...');
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

    const body = new Uint8Array(beforeBytes.length + pdfBlob.byteLength + afterBytes.length);
    body.set(beforeBytes);
    body.set(new Uint8Array(pdfBlob), beforeBytes.length);
    body.set(afterBytes, beforeBytes.length + pdfBlob.byteLength);

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

    // Step 5: Make shareable and get link
    console.log('Step 5: Making file shareable...');
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

    // Step 6: Send email via Brevo
    console.log('Step 6: Sending email via Brevo...');
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');

    const emailBody = `Hi ${clientName.split(' ')[0]},

Your invoice for media services at ${jobAddress} is ready. Please use the link below to view the invoice and submit payment at your convenience.

<a href="${driveViewLink}">👉 View Invoice</a>

If you have any questions or need anything at all, feel free to reach out. Thank you again for the opportunity to work with you.

Best regards,
Bradley Burke
Arriv Estate Media
📞 678-242-9107
🌐 arrivestatemedia.com`;

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
        htmlContent: emailBody,
        trackingParams: {
          utmSource: 'invoice_email'
        }
      })
    });

    const brevoData = await brevoResponse.json();
    if (!brevoResponse.ok) {
      throw new Error(`Brevo error: ${brevoData.message}`);
    }

    console.log('Email sent via Brevo:', brevoData.messageId);

    return Response.json({
      success: true,
      invoiceFileId: pdfFileId,
      driveViewLink,
      messageId: brevoData.messageId
    });

  } catch (error) {
    console.error('Error generating invoice from template:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});