import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Generate branded HTML invoice
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
    const servicesList = [{ desc: packageDescText, price: packageBaseAmount }];
    booking.add_ons?.forEach(addon => {
      servicesList.push({
        desc: addonDescriptions[addon] || addon,
        price: addonPrices[addon] || 0
      });
    });

    const invoiceHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f5f5f5;
      padding: 40px;
      color: #1a1a1a;
    }
    .invoice-container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 50px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 50px;
      border-bottom: 2px solid #B8956A;
      padding-bottom: 30px;
    }
    .logo-img {
      max-width: 300px;
      height: auto;
      margin-bottom: 20px;
    }
    .invoice-title {
      font-size: 32px;
      font-weight: 700;
      color: #B8956A;
      letter-spacing: 2px;
      margin-top: 20px;
    }
    .invoice-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
      font-size: 14px;
    }
    .meta-section {
      text-align: left;
    }
    .meta-label {
      font-weight: 600;
      color: #B8956A;
      margin-bottom: 5px;
    }
    .meta-value {
      color: #1a1a1a;
      line-height: 1.6;
    }
    .services-section {
      margin: 40px 0;
    }
    .services-title {
      font-size: 14px;
      font-weight: 700;
      color: #B8956A;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 20px;
    }
    .services-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .services-table thead tr {
      border-bottom: 2px solid #B8956A;
    }
    .services-table th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #B8956A;
      font-size: 13px;
      text-transform: uppercase;
    }
    .services-table td {
      padding: 15px 12px;
      border-bottom: 1px solid #e5e5e5;
      font-size: 14px;
    }
    .services-table tr:last-child td {
      border-bottom: 2px solid #B8956A;
    }
    .amount-right {
      text-align: right;
    }
    .total-section {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
      margin-bottom: 40px;
    }
    .total-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
      font-size: 16px;
      font-weight: 700;
      color: #1a1a1a;
      padding: 15px 0;
      border-top: 2px solid #B8956A;
    }
    .total-amount {
      text-align: right;
      color: #B8956A;
      font-size: 24px;
    }
    .payment-section {
      background: #f9f9f9;
      border-left: 4px solid #B8956A;
      padding: 20px;
      margin: 30px 0;
    }
    .payment-title {
      font-weight: 700;
      color: #B8956A;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .payment-link {
      display: inline-block;
      background: #B8956A;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 4px;
      font-weight: 600;
      margin-top: 10px;
      font-size: 13px;
    }
    .payment-link:hover {
      background: #a68559;
    }
    .footer {
      text-align: center;
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e5e5e5;
      font-size: 12px;
      color: #666;
    }
    .contact-info {
      font-size: 13px;
      color: #666;
      line-height: 1.6;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/ee143dd3f_IMG_5660.png" alt="Arriv Estate Media" class="logo-img">
      <div class="invoice-title">INVOICE</div>
    </div>

    <div class="invoice-meta">
      <div class="meta-section">
        <div class="meta-label">Invoice #</div>
        <div class="meta-value">${invoiceNumber}</div>
        <div class="meta-label" style="margin-top: 15px;">Invoice Date</div>
        <div class="meta-value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
      <div class="meta-section">
        <div class="meta-label">Bill To</div>
        <div class="meta-value">
          ${booking.client_name}<br>
          ${jobAddress}<br>
          Service Date: ${new Date(booking.preferred_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </div>

    <div class="services-section">
      <div class="services-title">Services Provided</div>
      <table class="services-table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="amount-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${servicesList.map(item => `
          <tr>
            <td>${item.desc}</td>
            <td class="amount-right">$${item.price.toFixed(2)}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="total-section">
        <div></div>
        <div class="total-row">
          <span>Total Due</span>
          <div class="total-amount">$${totalAmount.toFixed(2)}</div>
        </div>
      </div>
    </div>

    <div class="payment-section">
      <div class="payment-title">PAYMENT TERMS</div>
      <p style="font-size: 13px; color: #666; line-height: 1.6; margin-bottom: 12px;">
        Payment is due in full prior to scheduled service. Please proceed to payment using the link below to confirm your booking.
      </p>
      <a href="${stripeData.url}" class="payment-link">Pay Now</a>
    </div>

    <div class="footer">
      <p><strong>Arriv Estate Media</strong></p>
      <div class="contact-info">
        📞 678-242-9107<br>
        🌐 arrivestatemedia.com
      </div>
      <p style="margin-top: 20px; color: #999;">Thank you for your business!</p>
    </div>
  </div>
</body>
</html>`;

    let googleDriveUrl = null;
    let googleDriveFileId = null;

    try {
      console.log('Uploading invoice to Google Drive...');
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

      const folderId = '1CBoctYJXKv-shB54PIINOlAFBt5CJFeh';
      const fileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.html`;

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
      form.append('file', new Blob([invoiceHTML], { type: 'text/html' }));

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

        await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        }).catch(() => {});
      } else {
        console.error('Drive upload failed:', fileData.error?.message || 'Unknown error');
      }
    } catch (driveErr) {
      console.error('Drive upload error:', driveErr.message || driveErr);
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