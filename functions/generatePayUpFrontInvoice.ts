import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    // Get booking details
    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);

    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Calculate total amount
    const packagePrices = {
      'mls_walkthrough': 100,
      'photo_essentials': 275,
      'photo_cinematic': 475,
      'premium_bundle': 675
    };

    const addonPrices = {
      'drone': 125,
      '3d_tour': 125,
      'twilight': 125,
      'rush_delivery': 100,
      'vertical_reel': 40,
      'ai_staging': 125
    };

    let totalAmount = packagePrices[booking.package] || 0;
    if (booking.add_ons && booking.add_ons.length > 0) {
      booking.add_ons.forEach(addon => {
        totalAmount += addonPrices[addon] || 0;
      });
    }

    // Use $1 for test accounts
    if (booking.client_email.includes('BradCBurke') || booking.client_email.includes('test-user')) {
      totalAmount = 1;
    }

    // Generate invoice number
    const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1);
    const lastNumber = allInvoices.length > 0 && allInvoices[0].invoice_number 
      ? parseInt(allInvoices[0].invoice_number) 
      : 1000;
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
        'line_items[0][price_data][product_data][name]': `Media Services - ${booking.street_address}`,
        'line_items[0][price_data][unit_amount]': String(Math.round(totalAmount * 100)),
        'line_items[0][quantity]': '1',
      }),
    });

    const stripeData = await stripeResponse.json();

    if (!stripeResponse.ok) {
      throw new Error(`Stripe error: ${stripeData.error?.message || 'Unknown error'}`);
    }

    const jobAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;

    // Generate tracked link
    const trackToken = crypto.randomUUID();
    const trackedUrl = `${Deno.env.get('BASE44_APP_DOMAIN')}/TrackLink?token=${trackToken}`;

    // Generate beautifully formatted invoice PDF
    let googleDriveUrl = null;
    let googleDriveFileId = null;

    try {
      console.log('Generating branded invoice PDF...');

      // Create PDF with cream background
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Cream background
      pdf.setFillColor(255, 251, 245); // #FFFBF5
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');

      // Logo
      try {
        const logoUrl = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/2fc0e9531_Arriv_Estate_Media_Logo.png';
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const logoBlob = await logoRes.arrayBuffer();
          const bytes = new Uint8Array(logoBlob);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const logoBase64Encoded = btoa(binary);
          pdf.addImage(`data:image/png;base64,${logoBase64Encoded}`, 'PNG', pageWidth / 2 - 20, 12, 40, 20);
        }
      } catch (logoErr) {
        console.warn('Logo loading skipped:', logoErr.message);
      }

      // Main title
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(24);
      pdf.setTextColor(26, 26, 26);
      pdf.text('MEDIA INVOICE', pageWidth / 2, 50, { align: 'center' });

      // Invoice details
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(26, 26, 26);
      pdf.text(`Invoice #: ${invoiceNumber}`, 20, 62);
      pdf.text(`Invoice Date: ${new Date().toLocaleDateString()}`, 120, 62);

      // Client info
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(10);
      pdf.text('Client:', 20, 72);
      pdf.setFont(undefined, 'normal');
      pdf.text(booking.client_name, 55, 72);

      pdf.setFont(undefined, 'bold');
      pdf.text('Property:', 20, 80);
      pdf.setFont(undefined, 'normal');
      pdf.text(jobAddress, 55, 80);

      pdf.setFont(undefined, 'bold');
      pdf.text('Service Date:', 20, 88);
      pdf.setFont(undefined, 'normal');
      pdf.text(booking.preferred_date, 55, 88);

      // Services section
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(26, 26, 26);
      pdf.text('Services Provided', 20, 100);

      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      const packageDescriptions = {
        'mls_walkthrough': 'MLS Walkthrough',
        'photo_essentials': 'Photo Essentials Package',
        'photo_cinematic': 'Photo Cinematic Package',
        'premium_bundle': 'Premium Bundle Package'
      };
      const packageDescText = packageDescriptions[booking.package] || booking.package;
      let servicesList = [packageDescText];
      if (booking.add_ons && booking.add_ons.length > 0) {
        const addonDescriptions = {
          'drone': 'Drone Photography',
          '3d_tour': '3D Virtual Tour',
          'twilight': 'Twilight Photography',
          'rush_delivery': 'Rush Delivery',
          'vertical_reel': 'Vertical Reel',
          'ai_staging': 'AI Staging'
        };
        booking.add_ons.forEach(addon => {
          servicesList.push(addonDescriptions[addon] || addon);
        });
      }
      let yPos = 108;
      servicesList.forEach(service => {
        pdf.text(`• ${service}`, 25, yPos);
        yPos += 6;
      });

      // Payment terms section
      yPos += 5;
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(11);
      pdf.text('Payment Terms', 20, yPos);

      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(9);
      yPos += 8;
      pdf.text('Pay-Up-Front', 20, yPos);

      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      yPos += 6;
      pdf.text('Full payment is required prior to the scheduled shoot. Appointments are confirmed once payment is received.', 20, yPos, { maxWidth: pageWidth - 40 });

      // Pricing table
      yPos += 12;
      const tableTop = yPos;
      const col1X = 20;
      const col2X = pageWidth - 50;

      // Table header
      pdf.setFillColor(230, 220, 205); // Light cream border
      pdf.rect(col1X, tableTop, pageWidth - 40, 8, 'F');

      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(26, 26, 26);
      pdf.text('Description', col1X + 2, tableTop + 6);
      pdf.text('Amount', col2X, tableTop + 6, { align: 'right' });

      // Table rows
      yPos = tableTop + 8;
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);

      const packagePrices = {
        'mls_walkthrough': 100,
        'photo_essentials': 275,
        'photo_cinematic': 475,
        'premium_bundle': 675
      };
      const addonPrices = {
        'drone': 125,
        '3d_tour': 125,
        'twilight': 125,
        'rush_delivery': 100,
        'vertical_reel': 40,
        'ai_staging': 125
      };

      const packageBaseAmount = packagePrices[booking.package] || 0;
      pdf.text(packageDescText, col1X + 2, yPos);
      pdf.text(`$${packageBaseAmount.toFixed(2)}`, col2X, yPos, { align: 'right' });

      yPos += 7;
      if (booking.add_ons && booking.add_ons.length > 0) {
        booking.add_ons.forEach(addon => {
          const addonName = addonDescriptions[addon] || addon;
          const addonPrice = addonPrices[addon] || 0;
          pdf.text(addonName, col1X + 2, yPos);
          pdf.text(`$${addonPrice.toFixed(2)}`, col2X, yPos, { align: 'right' });
          yPos += 7;
        });
      }

      // Total row
      pdf.setFillColor(230, 220, 205); // Light cream border
      pdf.rect(col1X, yPos, pageWidth - 40, 8, 'F');

      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(10);
      pdf.text('Total Due', col1X + 2, yPos + 6);
      pdf.text(`$${totalAmount.toFixed(2)}`, col2X, yPos + 6, { align: 'right' });

      // Pay now section
      yPos += 12;
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(11);
      pdf.text('Pay Now (Stripe)', 20, yPos);

      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(0, 102, 204);
      yPos += 6;
      pdf.text(stripeData.url, 20, yPos);

      // Footer message
      yPos += 12;
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(26, 26, 26);
      pdf.text('Thank you for choosing ', 20, yPos);
      pdf.setFont(undefined, 'bold');
      pdf.text('Arriv Estate Media', 61, yPos);
      pdf.setFont(undefined, 'normal');
      pdf.text('.', 99, yPos);

      yPos += 6;
      pdf.setFontSize(9);
      pdf.text('Please feel free to reach out if any adjustments are needed.', 20, yPos);

      const pdfBytes = pdf.output('arraybuffer');

      console.log('Getting Google Drive access token...');
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
      console.log('Uploading to Google Drive...');

      const folderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';
      const fileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;

      // Construct multipart body manually for Deno compatibility
      const boundary = '===============7330845974216740156==';
      const metadata = { name: fileName, parents: [folderId] };
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

      const fileData = await uploadRes.json();

      if (uploadRes.ok && fileData.id) {
        googleDriveUrl = `https://drive.google.com/file/d/${fileData.id}/view`;
        googleDriveFileId = fileData.id;
        console.log('Successfully uploaded to Google Drive:', googleDriveUrl);

        // Make shareable
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        }).catch((e) => console.error('Share error:', e.message));
      } else {
        console.error('Drive upload failed:', fileData.error?.message || 'Unknown error');
      }
    } catch (pdfErr) {
      console.error('PDF generation error:', pdfErr.message || pdfErr);
    }

    // Create invoice record with Google Drive URL already populated
    const invoice = await base44.asServiceRole.entities.Invoice.create({
      invoice_number: invoiceNumber,
      invoice_type: 'pay_up_front',
      booking_id: bookingId,
      client_name: booking.client_name,
      client_email: booking.client_email,
      job_address: jobAddress,
      service_date: booking.preferred_date,
      package: booking.package,
      add_ons: booking.add_ons || [],
      amount: totalAmount,
      payment_status: 'unpaid',
      stripe_payment_link_id: stripeData.id,
      stripe_payment_link_url: stripeData.url,
      tracked_link_token: trackToken,
      tracked_link_url: trackedUrl,
      google_drive_unpaid_url: googleDriveUrl,
      google_drive_file_id: googleDriveFileId,
      pay_at_closing: false
    });

    const invoiceId = invoice.id;

    // Send invoice email via Gmail
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      const emailBody = `Hi ${booking.client_name.split(' ')[0]},

    Your invoice for media services at ${jobAddress} is ready. Please use the link below to view the invoice and submit payment at your convenience.

    👉 View Invoice: ${trackedUrl}

    If you have any questions or need anything at all, feel free to reach out. Thank you again for the opportunity to work with you.

    Best regards,
    Bradley Burke
    Arriv Estate Media
    📞 678-242-9107
    🌐 arrivestatemedia.com`;

      const message = [
        `To: ${booking.client_email}`,
        'Subject: Your Invoice from Arriv Estate Media',
        'Content-Type: text/plain; charset=utf-8',
        '',
        emailBody
      ].join('\r\n');

      const encodedMessage = btoa(unescape(encodeURIComponent(message)));

      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encodedMessage })
      });
    } catch (emailError) {
      console.error('Error sending email:', emailError.message);
    }

    // Schedule reminders
    try {
      await base44.asServiceRole.functions.invoke('scheduleInvoiceReminders', {
        invoiceId: invoice.id
      });
    } catch (reminderError) {
      console.error('Error scheduling reminders:', reminderError.message);
    }

    return Response.json({ 
      success: true, 
      invoiceId: invoice.id,
      invoiceNumber,
      stripeLink: stripeData.url
    });

  } catch (error) {
    console.error('Error generating invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});