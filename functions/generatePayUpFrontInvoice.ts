import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb, degrees } from 'npm:pdf-lib@1.17.1';

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
    if (booking.client_email === 'BradCBurke@gmail.com' || booking.client_email.includes('test-user')) {
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

      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]); // Letter size
      const { width, height } = page.getSize();

      // Cream background
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: rgb(240/256, 235/256, 225/256)
      });

      let yPos = height - 40;

      // Logo text
      page.drawText('ARRIV', {
        x: 40,
        y: yPos,
        size: 20,
        color: rgb(140/256, 105/256, 60/256)
      });
      page.drawText('ESTATE MEDIA', {
        x: 40,
        y: yPos - 15,
        size: 8,
        color: rgb(140/256, 105/256, 60/256)
      });

      yPos -= 50;
      page.drawText('INVOICE', {
        x: 40,
        y: yPos,
        size: 24,
        color: rgb(26/256, 26/256, 26/256)
      });

      yPos -= 35;
      page.drawText(`Invoice #: ${invoiceNumber}`, {
        x: 40,
        y: yPos,
        size: 10,
        color: rgb(26/256, 26/256, 26/256)
      });

      yPos -= 15;
      page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
        x: 40,
        y: yPos,
        size: 10,
        color: rgb(26/256, 26/256, 26/256)
      });

      yPos -= 30;
      page.drawText('BILL TO:', {
        x: 40,
        y: yPos,
        size: 11,
        color: rgb(26/256, 26/256, 26/256)
      });

      yPos -= 15;
      page.drawText(booking.client_name, {
        x: 40,
        y: yPos,
        size: 10,
        color: rgb(26/256, 26/256, 26/256)
      });

      yPos -= 12;
      page.drawText('Listing Address:', {
        x: 40,
        y: yPos,
        size: 9,
        color: rgb(184/256, 149/256, 106/256)
      });

      yPos -= 12;
      page.drawText(jobAddress, {
        x: 40,
        y: yPos,
        size: 10,
        color: rgb(26/256, 26/256, 26/256)
      });

      yPos -= 12;
      page.drawText(`Service Date: ${booking.preferred_date}`, {
        x: 40,
        y: yPos,
        size: 10,
        color: rgb(26/256, 26/256, 26/256)
      });

      yPos -= 25;
      page.drawText('SERVICES PROVIDED', {
        x: 40,
        y: yPos,
        size: 11,
        color: rgb(184/256, 149/256, 106/256)
      });

      yPos -= 8;
      page.drawLine({
        start: { x: 40, y: yPos },
        end: { x: width - 40, y: yPos },
        color: rgb(184/256, 149/256, 106/256),
        thickness: 1
      });

      yPos -= 15;
      page.drawText('Description', {
        x: 40,
        y: yPos,
        size: 10,
        color: rgb(26/256, 26/256, 26/256)
      });
      page.drawText('Amount', {
        x: width - 100,
        y: yPos,
        size: 10,
        color: rgb(26/256, 26/256, 26/256)
      });

      // Services
      yPos -= 12;
      const packageDescriptions = {
        'mls_walkthrough': 'MLS Walkthrough',
        'photo_essentials': 'Photo Essentials Package',
        'photo_cinematic': 'Photo Cinematic Package',
        'premium_bundle': 'Premium Bundle Package'
      };
      const addonDescriptions = {
        'drone': 'Drone Photography',
        '3d_tour': '3D Virtual Tour',
        'twilight': 'Twilight Photography',
        'rush_delivery': 'Rush Delivery',
        'vertical_reel': 'Vertical Reel',
        'ai_staging': 'AI Staging'
      };

      const packageBaseAmount = packagePrices[booking.package] || 0;
      const packageDescText = packageDescriptions[booking.package] || booking.package;

      page.drawText(packageDescText, {
        x: 40,
        y: yPos,
        size: 10,
        color: rgb(26/256, 26/256, 26/256)
      });
      page.drawText(`$${packageBaseAmount.toFixed(2)}`, {
        x: width - 100,
        y: yPos,
        size: 10,
        color: rgb(26/256, 26/256, 26/256)
      });

      yPos -= 12;
      if (booking.add_ons && booking.add_ons.length > 0) {
        booking.add_ons.forEach(addon => {
          const addonName = addonDescriptions[addon] || addon;
          const addonPrice = addonPrices[addon] || 0;
          page.drawText(addonName, {
            x: 40,
            y: yPos,
            size: 10,
            color: rgb(26/256, 26/256, 26/256)
          });
          page.drawText(`$${addonPrice.toFixed(2)}`, {
            x: width - 100,
            y: yPos,
            size: 10,
            color: rgb(26/256, 26/256, 26/256)
          });
          yPos -= 12;
        });
      }

      // Total
      yPos -= 8;
      page.drawLine({
        start: { x: 40, y: yPos },
        end: { x: width - 40, y: yPos },
        color: rgb(184/256, 149/256, 106/256),
        thickness: 1
      });

      yPos -= 15;
      page.drawText('TOTAL DUE:', {
        x: 40,
        y: yPos,
        size: 12,
        color: rgb(26/256, 26/256, 26/256)
      });
      page.drawText(`$${totalAmount.toFixed(2)}`, {
        x: width - 100,
        y: yPos,
        size: 12,
        color: rgb(184/256, 149/256, 106/256)
      });

      // Payment section
      yPos -= 30;
      page.drawText('PAYMENT INSTRUCTIONS', {
        x: 40,
        y: yPos,
        size: 11,
        color: rgb(26/256, 26/256, 26/256)
      });

      yPos -= 12;
      page.drawText('Full payment is required before your scheduled shoot.', {
        x: 40,
        y: yPos,
        size: 9,
        color: rgb(26/256, 26/256, 26/256)
      });

      yPos -= 12;
      page.drawText('Click here to pay:', {
        x: 40,
        y: yPos,
        size: 9,
        color: rgb(0, 0, 1)
      });
      page.drawText(stripeData.url, {
        x: 130,
        y: yPos,
        size: 9,
        color: rgb(0, 0, 1)
      });

      const pdfBytes = await pdfDoc.save();

      console.log('PDF generated, size:', pdfBytes.length, 'bytes');
      console.log('Getting Google Drive access token...');
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
      console.log('Uploading to Google Drive...');

      const folderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';
      const fileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
      form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }));

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: form
      });

      const fileData = await uploadRes.json();

      if (uploadRes.ok && fileData.id) {
        googleDriveUrl = `https://drive.google.com/file/d/${fileData.id}/view`;
        googleDriveFileId = fileData.id;
        console.log('Successfully uploaded to Google Drive:', googleDriveUrl);

        // Make shareable
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          });
        } catch (e) {
          console.error('Share error:', e.message);
        }
      } else {
        console.error('Drive upload failed:', fileData.error?.message || 'Unknown error');
        throw new Error(`Failed to upload PDF to Google Drive: ${fileData.error?.message}`);
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