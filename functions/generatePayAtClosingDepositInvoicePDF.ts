import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const { invoiceNumber, clientName, jobAddress, serviceDate, packageName, addOns, packageMinimum, payAtClosingRate, stripeUrl, isDepositReceived = false } = await req.json();

    // Package descriptions
    const packageDescriptions = {
      'mls_walkthrough': 'MLS Walkthrough',
      'photo_essentials': 'Photo Essentials Package',
      'photo_cinematic': 'Photo Cinematic Package',
      'premium_bundle': 'Premium Bundle Package'
    };

    const addonDescriptions = {
      'drone': 'Drone add-on (photos + short clips)',
      '3d_tour': '3D Tour',
      'twilight': 'Twilight exterior edits (up to 5 photos)',
      'rush_delivery': 'Next day rush delivery',
      'vertical_reel': 'Additional vertical reel',
      'ai_staging': 'AI Staging'
    };

    const addonPrices = {
      'drone': 125,
      '3d_tour': 125,
      'twilight': 125,
      'rush_delivery': 100,
      'vertical_reel': 40,
      'ai_staging': 125
    };

    const depositAmount = 50;
    const balanceDueAtClosing = packageMinimum - depositAmount;
    const payAtClosingPercentageDisplay = (payAtClosingRate * 100).toFixed(2);

    // Create invoice HTML
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
        .payment-terms ul {
          margin: 10px 0;
          padding-left: 20px;
        }
        .payment-terms li {
          margin: 5px 0;
        }
        .info-box {
          background-color: #f9f9f9;
          padding: 15px;
          margin: 20px 0;
          border-left: 4px solid #b8956a;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-text">ARRIV</div>
        <div class="logo-subtitle">ESTATE MEDIA</div>
      </div>

      <div class="title">${isDepositReceived ? 'MEDIA INVOICE' : 'MEDIA INVOICE'}</div>

      <div class="invoice-details">
        <div class="details-column">
          <div class="detail-row"><span class="detail-label">Invoice #:</span> ${invoiceNumber}</div>
          <div class="detail-row"><span class="detail-label">Client:</span> ${clientName}</div>
          <div class="detail-row"><span class="detail-label">Property:</span> ${jobAddress}</div>
          <div class="detail-row"><span class="detail-label">Service Date:</span> ${serviceDate}</div>
        </div>
        <div class="details-column" style="text-align: right;">
          <div class="detail-row"><span class="detail-label">Invoice Date:</span> ${new Date().toLocaleDateString()}</div>
        </div>
      </div>

      <div class="section-title">Payment Method</div>
      <div class="info-box">
        <strong>Pay-at-Closing</strong>
      </div>

      <div class="section-title">Services & Pricing Details</div>
      <table>
        <tr>
          <th>Description</th>
          <th class="amount-right">Amount</th>
        </tr>
        <tr>
          <td><strong>Package Minimum:</strong> ${packageDescriptions[packageName] || packageName}</td>
          <td class="amount-right"><strong>$${packageMinimum.toFixed(2)}</strong></td>
        </tr>
        ${(addOns || []).map(addon => `
        <tr>
          <td style="padding-left: 24px;">${addonDescriptions[addon] || addon}</td>
          <td class="amount-right">$${(addonPrices[addon] || 0).toFixed(2)}</td>
        </tr>
        `).join('')}
      </table>

      <div class="section-title">Pay-at-Closing Rate</div>
      <div class="info-box">
        <strong>${payAtClosingPercentageDisplay}% of Final Sale Price</strong> (Calculated at closing)
      </div>

      <div class="section-title">Payment Terms</div>
      <table>
        <tr>
          <th>Description</th>
          <th class="amount-right">Amount</th>
        </tr>
        <tr>
          <td>${isDepositReceived ? 'Booking deposit received' : 'Booking deposit due now'}</td>
          <td class="amount-right">${isDepositReceived ? '-$50.00' : '$50.00'}</td>
        </tr>
        <tr class="total-row">
          <td>${isDepositReceived ? 'Minimum Due at Closing' : 'Minimum Due at Closing'}</td>
          <td class="amount-right">$${balanceDueAtClosing.toFixed(2)} OR ${payAtClosingPercentageDisplay}% of Final Sale Price</td>
        </tr>
      </table>

      <div class="section-title">Pay-at-Closing Terms</div>
      <div class="payment-terms">
        <p>If any of the following occur, this Agreement shall automatically convert to a flat fee of the package minimum, with payment due within seven (7) days of written notice (less deposit):</p>
        <ul>
          <li>The property is withdrawn, canceled, or expires</li>
          <li>The listing is terminated, transferred, or reassigned to another agent or brokerage</li>
          <li>The property is relisted under a new MLS number</li>
          <li>The seller changes representation</li>
          <li>The property is rented, leased, or otherwise disposed of without a sale</li>
          <li>The sale does not occur within six (6) months of the original listing date</li>
          <li>Payment is not received at closing for any reason</li>
        </ul>
      </div>

      ${!isDepositReceived ? `<a href="${stripeUrl}" class="payment-button">Pay Deposit Now (Stripe)</a>` : ''}

      <div class="footer">
        <p>Thank you for choosing <strong>Arriv Estate Media</strong>.</p>
        <p>Please feel free to reach out if any adjustments are needed.</p>
      </div>
    </body>
    </html>
    `;

    return Response.json({ 
      success: true,
      html: invoiceHTML
    });

  } catch (error) {
    console.error('Error generating pay-at-closing deposit invoice HTML:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});