import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Generate PDF from HTML using a simple approach
function generatePDFFromHTML(html) {
  // Create a simple HTML-to-PDF conversion
  // Return HTML as-is, will be converted on client-side or via external service
  return html;
}

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

    // Generate PDF invoice and upload to Google Drive
    let googleDriveUrl = null;
    let googleDriveFileId = null;
    
    try {
      // Generate invoice HTML inline
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
      const addonPrices = {
        'drone': 125, '3d_tour': 125, 'twilight': 125,
        'rush_delivery': 100, 'vertical_reel': 40, 'ai_staging': 125
      };

      const packageBaseAmount = packagePrices[booking.package] || 0;
      const addonRows = (booking.add_ons || []).map(addon => `<tr><td>${addonDescriptions[addon] || addon}</td><td>${(addonPrices[addon] || 0).toFixed(2)}</td></tr>`).join('');

      const invoiceHTML = `<!DOCTYPE html>
      <html>
      <head>
      <style>
      body {
      font-family: Arial, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f5f1ed;
      color: #333;
      }
      .container {
      background: white;
      padding: 60px 40px;
      }
      .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 2px solid #b8956a;
      padding-bottom: 20px;
      }
      .logo {
      font-size: 32px;
      font-weight: bold;
      letter-spacing: 3px;
      color: #1a1a1a;
      margin-bottom: 5px;
      }
      .logo-subtitle {
      font-size: 11px;
      color: #b8956a;
      letter-spacing: 2px;
      }
      .title {
      font-size: 20px;
      font-weight: bold;
      text-align: center;
      margin: 30px 0;
      }
      .invoice-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
      font-size: 13px;
      }
      .info-block {
      flex: 1;
      }
      .info-row {
      margin: 8px 0;
      }
      .info-label {
      font-weight: bold;
      }
      .section-title {
      font-weight: bold;
      font-size: 13px;
      margin-top: 30px;
      margin-bottom: 15px;
      }
      table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 13px;
      }
      thead {
      background-color: #e8e0d8;
      border: 1px solid #ccc;
      }
      th {
      padding: 12px;
      text-align: left;
      font-weight: bold;
      border: 1px solid #ccc;
      }
      td {
      padding: 12px;
      border: 1px solid #ccc;
      }
      .amount-col {
      text-align: right;
      }
      .total-row {
      background-color: #e8e0d8;
      font-weight: bold;
      }
      .payment-terms {
      margin-bottom: 30px;
      font-size: 13px;
      line-height: 1.6;
      }
      .payment-button {
      display: inline-block;
      background-color: #b8956a;
      color: white;
      padding: 12px 28px;
      text-decoration: none;
      border-radius: 3px;
      font-weight: bold;
      font-size: 13px;
      margin-top: 15px;
      }
      .footer {
      text-align: center;
      margin-top: 50px;
      font-size: 12px;
      color: #666;
      }
      </style>
      </head>
      <body>
      <div class="container">
      <div class="header">
      <div class="logo">◎ ARRIV</div>
      <div class="logo-subtitle">ESTATE MEDIA</div>
      </div>

      <div class="title">MEDIA INVOICE</div>

      <div class="invoice-info">
      <div class="info-block">
      <div class="info-row"><span class="info-label">Invoice #:</span> ${invoiceNumber}</div>
      <div class="info-row"><span class="info-label">Client:</span> ${booking.client_name}</div>
      <div class="info-row"><span class="info-label">Property:</span> ${jobAddress}</div>
      <div class="info-row"><span class="info-label">Service Date:</span> ${booking.preferred_date}</div>
      </div>
      <div class="info-block" style="text-align: right;">
      <div class="info-row"><span class="info-label">Invoice Date:</span> ${new Date().toLocaleDateString()}</div>
      </div>
      </div>

      <div class="section-title">Services Provided</div>
      <table>
      <thead>
      <tr>
      <th>Description</th>
      <th class="amount-col">Amount</th>
      </tr>
      </thead>
      <tbody>
      <tr>
      <td>${packageDescriptions[booking.package] || booking.package}</td>
      <td class="amount-col">$${packageBaseAmount.toFixed(2)}</td>
      </tr>
      ${addonRows}
      <tr class="total-row">
      <td>Total Due</td>
      <td class="amount-col">$${totalAmount.toFixed(2)}</td>
      </tr>
      </tbody>
      </table>

      <div class="section-title">Payment Terms</div>
      <div class="payment-terms">
      <strong>Pay-Up-Front</strong><br>
      Full payment is required prior to the scheduled shoot. Appointments are confirmed once payment is received.
      </div>

      <a href="${stripeData.url}" class="payment-button">Pay Now (Stripe)</a>

      <div class="footer">
      <p>Thank you for choosing <strong>Arriv Estate Media</strong>.</p>
      <p>Please feel free to reach out if any adjustments are needed.</p>
      </div>
      </div>
      </body>
      </html>`;

      // Upload HTML invoice to Google Drive directly using access token
      console.log('Uploading invoice to Google Drive...');
      const folderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';
      const fileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.html`;
      
      try {
        console.log('Getting Google Drive access token...');
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
        console.log('Access token obtained, uploading to Google Drive...');
        
        // Convert HTML string to bytes
        const encoder = new TextEncoder();
        const bytes = encoder.encode(invoiceHTML);
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
        form.append('file', new Blob([bytes], { type: 'text/html' }));
        
        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: form
        });
        
        const fileData = await uploadRes.json();
        console.log('Upload response status:', uploadRes.status, 'File data:', fileData);
        
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
          console.error('Drive upload failed:', fileData.error?.message || 'Unknown error', uploadRes.status);
        }
      } catch (uploadErr) {
        console.error('Direct upload error:', uploadErr.message || uploadErr);
      }
    } catch (driveError) {
      console.error('PDF generation/upload error:', driveError.message || driveError);
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