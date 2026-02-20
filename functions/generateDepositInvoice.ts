import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb } from 'npm:pdf-lib@^1.17.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { bookingId, jobId } = await req.json();
    
    // Get booking details
    const bookings = await base44.asServiceRole.entities.Booking.filter({ id: bookingId });
    const booking = bookings[0];
    
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Calculate package minimum and pay-at-closing rate
    const packageData = {
      'mls_walkthrough': { price: 100, rate: 0.0003 },
      'photo_essentials': { price: 275, rate: 0.0005 },
      'photo_cinematic': { price: 475, rate: 0.0008 },
      'premium_bundle': { price: 675, rate: 0.0010 }
    };
    
    const addonPrices = {
      'drone': 125,
      '3d_tour': 125,
      'twilight': 125,
      'rush_delivery': 100,
      'vertical_reel': 40,
      'ai_staging': 125
    };
    
    let packageMinimum = packageData[booking.package]?.price || 0;
    if (booking.add_ons && booking.add_ons.length > 0) {
      booking.add_ons.forEach(addon => {
        packageMinimum += addonPrices[addon] || 0;
      });
    }
    
    const payAtClosingRate = packageData[booking.package]?.rate || 0.0008;
    let depositAmount = 50;

    // Use $1 for test accounts
    if (booking.client_email === 'BradCBurke@gmail.com' || booking.client_email.includes('test-user')) {
      depositAmount = 1;
    }

    // Generate invoice number
    const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1);
    const lastNumber = allInvoices.length > 0 && allInvoices[0].invoice_number 
      ? parseInt(allInvoices[0].invoice_number) 
      : 1000;
    const invoiceNumber = String(lastNumber + 1);

    // Create Stripe payment link for deposit
    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `Booking Deposit - ${booking.street_address}`,
        'line_items[0][price_data][unit_amount]': String(depositAmount * 100),
        'line_items[0][quantity]': '1',
      }),
    });

    const stripeData = await stripeResponse.json();

    const jobAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    const trackToken = crypto.randomUUID();
    const trackedUrl = `${Deno.env.get('BASE44_APP_DOMAIN')}/t/${trackToken}`;

    // Create invoice record
    const invoice = await base44.asServiceRole.entities.Invoice.create({
      invoice_number: invoiceNumber,
      invoice_type: 'deposit',
      booking_id: bookingId,
      job_id: jobId,
      client_name: booking.client_name,
      client_email: booking.client_email,
      job_address: jobAddress,
      service_date: booking.preferred_date,
      package: booking.package,
      add_ons: booking.add_ons || [],
      amount: depositAmount,
      deposit_amount: depositAmount,
      payment_status: 'unpaid',
      stripe_payment_link_id: stripeData.id,
      stripe_payment_link_url: stripeData.url,
      tracked_link_token: trackToken,
      tracked_link_url: trackedUrl,
      pay_at_closing: true,
      pay_at_closing_rate: payAtClosingRate,
      package_minimum: packageMinimum
    });

    // Generate PDF HTML with pay-at-closing terms
    const invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          background: white;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
        }
        .logo-text {
          font-size: 28px;
          font-weight: bold;
          letter-spacing: 2px;
          color: #1a1a1a;
          margin-bottom: 5px;
        }
        .logo-subtitle {
          font-size: 12px;
          color: #b8956a;
          letter-spacing: 1px;
        }
        .title {
          font-size: 24px;
          font-weight: bold;
          margin: 30px 0 10px 0;
        }
        .invoice-details {
          display: flex;
          justify-content: space-between;
          margin: 20px 0;
          font-size: 14px;
        }
        .details-column {
          flex: 1;
        }
        .detail-row {
          margin: 8px 0;
        }
        .detail-label {
          font-weight: bold;
        }
        .section-title {
          font-weight: bold;
          font-size: 14px;
          margin-top: 25px;
          margin-bottom: 10px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          font-size: 14px;
        }
        th {
          background-color: #f5f5f5;
          padding: 12px;
          text-align: left;
          font-weight: bold;
          border: 1px solid #ddd;
        }
        td {
          padding: 12px;
          border: 1px solid #ddd;
        }
        .amount-right {
          text-align: right;
        }
        .total-row {
          background-color: #f9f9f9;
          font-weight: bold;
        }
        .payment-button {
          display: inline-block;
          background-color: #b8956a;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 4px;
          margin-top: 20px;
          font-weight: bold;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          font-size: 13px;
          color: #666;
        }
        .payment-terms {
          background-color: #f9f9f9;
          padding: 15px;
          margin: 20px 0;
          border-left: 4px solid #b8956a;
          font-size: 13px;
          line-height: 1.6;
        }
        .terms-list {
          margin-left: 20px;
          font-size: 12px;
        }
        .terms-list li {
          margin-bottom: 8px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-text">ARRIV</div>
        <div class="logo-subtitle">ESTATE MEDIA</div>
      </div>

      <div class="title">DEPOSIT INVOICE</div>

      <div class="invoice-details">
        <div class="details-column">
          <div class="detail-row"><span class="detail-label">Invoice #:</span> ${invoiceNumber}</div>
          <div class="detail-row"><span class="detail-label">Client:</span> ${booking.client_name}</div>
          <div class="detail-row"><span class="detail-label">Property:</span> ${jobAddress}</div>
          <div class="detail-row"><span class="detail-label">Service Date:</span> ${booking.preferred_date}</div>
        </div>
        <div class="details-column" style="text-align: right;">
          <div class="detail-row"><span class="detail-label">Invoice Date:</span> ${new Date().toLocaleDateString()}</div>
        </div>
      </div>

      <div class="section-title">Services Provided</div>
      <table>
        <tr>
          <th>Description</th>
          <th class="amount-right">Amount</th>
        </tr>
        <tr>
          <td>Deposit Payment</td>
          <td class="amount-right">$${depositAmount.toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td>Total Due</td>
          <td class="amount-right">$${depositAmount.toFixed(2)}</td>
        </tr>
      </table>

      <div class="section-title">Pay-at-Closing Terms</div>
      <div class="payment-terms">
        If any of the following occur, this Agreement shall automatically convert to a flat fee of the package minimum, with payment due within seven (7) days of written notice (less deposit):
        <ol class="terms-list">
          <li>The property is withdrawn, canceled, or expires</li>
          <li>The listing is terminated, transferred, or reassigned to another agent or brokerage</li>
          <li>The property is relisted under a new MLS number</li>
          <li>The seller changes representation</li>
          <li>The property is rented, leased, or otherwise disposed of without a sale</li>
          <li>The sale does not occur within six (6) months of the original listing date</li>
          <li>Payment is not received at closing for any reason</li>
        </ol>
      </div>

      <div class="section-title">Payment Instructions</div>
      <div class="payment-terms">
        <strong>Deposit payment is required</strong> to confirm your booking. Please use the link below to submit payment. Once received, your shoot date will be confirmed.
      </div>

      <a href="${stripeData.url}" class="payment-button">Pay Deposit Now (Stripe)</a>

      <div class="footer">
        <p>Thank you for choosing <strong>Arriv Estate Media</strong>.</p>
        <p>Please feel free to reach out if any adjustments are needed.</p>
      </div>
    </body>
    </html>
    `;

    // Upload to Google Drive and send email
    const pdfBase64 = btoa(invoiceHTML);
    await base44.asServiceRole.functions.invoke('uploadInvoiceToGoogleDrive', {
      fileName: `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`,
      pdfBase64,
      folderType: 'unpaid'
    });

    await base44.asServiceRole.functions.invoke('sendInvoiceEmailViaGmail', {
      invoiceId: invoice.id,
      clientEmail: booking.client_email,
      clientName: booking.client_name.split(' ')[0],
      jobAddress,
      trackedLink: trackedUrl,
      isReminder: false
    });

    // Create closing detection record
    await base44.asServiceRole.entities.ClosingDetection.create({
      job_id: jobId,
      job_address: jobAddress,
      monitoring_start_date: booking.preferred_date,
      status: 'pending'
    });

    return Response.json({ 
      success: true, 
      invoiceId: invoice.id,
      stripeLink: stripeData.url
    });

  } catch (error) {
    console.error('Error generating deposit invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});