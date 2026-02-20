import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const { invoiceNumber, clientName, jobAddress, serviceDate, packageName, addOns, finalSalePrice, payAtClosingRate, depositPaid = 50 } = await req.json();

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

    // Calculate fees
    const baseFee = finalSalePrice * payAtClosingRate;
    const addonTotal = (addOns || []).reduce((sum, addon) => sum + (addonPrices[addon] || 0), 0);
    const totalFee = baseFee + addonTotal;
    const balanceDue = totalFee - depositPaid;
    const percentageDisplay = (payAtClosingRate * 100).toFixed(2);

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
        .info-box {
          background-color: #f9f9f9;
          padding: 15px;
          margin: 20px 0;
          border-left: 4px solid #b8956a;
          font-size: 13px;
        }
        .congratulations {
          background-color: #e8f5e9;
          padding: 15px;
          margin: 20px 0;
          border-left: 4px solid #4caf50;
          font-size: 13px;
          color: #2e7d32;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-text">ARRIV</div>
        <div class="logo-subtitle">ESTATE MEDIA</div>
      </div>

      <div class="congratulations">
        <strong>Congratulations on your listing being sold!</strong>
      </div>

      <div class="title">FINAL INVOICE</div>

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

      <div class="section-title">Final Sale Price</div>
      <div class="info-box">
        <strong>$${finalSalePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
      </div>

      <div class="section-title">Pricing (Pay-at-Closing)</div>
      <table>
        <tr>
          <th>Description</th>
          <th class="amount-right">Amount</th>
        </tr>
        <tr>
          <td>${percentageDisplay}% of $${finalSalePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="amount-right">$${baseFee.toFixed(2)}</td>
        </tr>
        ${(addOns || []).map(addon => `
        <tr>
          <td style="padding-left: 24px;">${addonDescriptions[addon] || addon}</td>
          <td class="amount-right">$${(addonPrices[addon] || 0).toFixed(2)}</td>
        </tr>
        `).join('')}
        <tr class="total-row">
          <td>Total Fee</td>
          <td class="amount-right">$${totalFee.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Booking Deposit (Paid)</td>
          <td class="amount-right">-$${depositPaid.toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td>Balance Due Now</td>
          <td class="amount-right">$${balanceDue.toFixed(2)}</td>
        </tr>
      </table>

      <div class="section-title">Payment Terms</div>
      <div class="info-box">
        <strong>Final Payment Due Upon Receipt</strong><br>
        Please complete payment of $${balanceDue.toFixed(2)} to finalize your account with Arriv Estate Media.
      </div>

      <div class="footer">
        <p>Thank you for choosing <strong>Arriv Estate Media</strong>.</p>
        <p>If you have any questions about this invoice, please feel free to reach out.</p>
      </div>
    </body>
    </html>
    `;

    return Response.json({ 
      success: true,
      html: invoiceHTML
    });

  } catch (error) {
    console.error('Error generating final closing invoice HTML:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});