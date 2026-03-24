import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const { invoiceNumber, clientName, jobAddress, serviceDate, packageName, addOns, totalAmount, stripeUrl } = await req.json();

    // Package descriptions
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
      'drone': 125,
      '3d_tour': 125,
      'twilight': 125,
      'rush_delivery': 100,
      'vertical_reel': 40,
      'ai_staging': 125
    };

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
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-text">ARRIV</div>
        <div class="logo-subtitle">ESTATE MEDIA</div>
      </div>

      <div class="title">MEDIA INVOICE</div>

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

      <div class="section-title">Services Provided</div>
      <table>
        <tr>
          <th>Description</th>
          <th class="amount-right">Amount</th>
        </tr>
        <tr>
          <td>${packageDescriptions[packageName] || packageName}</td>
          <td class="amount-right">$${(totalAmount - (addOns || []).reduce((sum, addon) => sum + (addonPrices[addon] || 0), 0)).toFixed(2)}</td>
        </tr>
        ${(addOns || []).map(addon => `
        <tr>
          <td>${addonDescriptions[addon] || addon}</td>
          <td class="amount-right">$${(addonPrices[addon] || 0).toFixed(2)}</td>
        </tr>
        `).join('')}
        <tr class="total-row">
          <td>Total Due</td>
          <td class="amount-right">$${totalAmount.toFixed(2)}</td>
        </tr>
      </table>

      <div class="section-title">Payment Terms</div>
      <div class="payment-terms">
        <strong>Pay-Up-Front</strong><br>
        Full payment is required prior to the scheduled shoot. Appointments are confirmed once payment is received.
      </div>

      <a href="${stripeUrl}" class="payment-button">Pay Now (Stripe)</a>

      <div class="footer">
          <p>Thank you for choosing <strong>Arriv Estate Media</strong>.</p>
          <p>Please feel free to reach out if any adjustments are needed.</p>
        </div>

        <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 10px; color: #999; line-height: 1.5;">
          <p><em><strong>*Refund Policy</strong></em></p>
          <p>Arriv Estate Media LLC is committed to delivering high-quality media and offers revisions or reshoots when necessary to meet expectations.</p>
          <p>Due to the time and production involved, completed services are generally non-refundable. However, partial refunds may be issued at ARRIV's discretion.</p>
          <p>Media usage rights are granted upon full payment. In the event of a refund, usage rights may be adjusted accordingly.</p>
        </div>
      </body>
      </html>
      `;

    return Response.json({ 
      success: true,
      html: invoiceHTML
    });

  } catch (error) {
    console.error('Error generating invoice HTML:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});