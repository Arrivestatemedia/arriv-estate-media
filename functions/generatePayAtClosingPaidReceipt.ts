import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb } from 'npm:pdf-lib@^1.17.1';

// Get pay-at-closing rate for package
function getPayAtClosingRate(packageName, totalAddOnPrice) {
  const packageRates = {
    'mls_walkthrough': 0.0003,
    'photo_essentials': 0.0005,
    'photo_cinematic': 0.0008,
    'premium_bundle': 0.0010
  };
  
  const packageRate = packageRates[packageName] || 0.0005;
  
  if (totalAddOnPrice > 0) {
    const combined = packageRate + totalAddOnPrice;
    if (combined <= 300) return 0.0003;
    if (combined <= 400) return 0.0005;
    if (combined <= 600) return 0.0008;
    return 0.0010;
  }
  
  return packageRate;
}

function formatPercentage(rate) {
  return (rate * 100).toFixed(2) + '%';
}

function getAddOnTotal(addOns) {
  const addOnPrices = {
    'Drone add-on (photos + short clips)': 125,
    'Drone': 125,
    '3D Tour': 125,
    'Twilight exterior edits (up to 5 photos)': 125,
    'Twilight': 125,
    'Next day rush delivery (when available)': 100,
    'Rush delivery': 100,
    'Additional vertical reel': 40,
    'Reel': 40,
    'AI Staging': 125,
    'Staging': 125
  };
  
  let total = 0;
  (addOns || []).forEach(addon => {
    total += addOnPrices[addon] || 0;
  });
  return total;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    const { invoiceId, booking, invoiceNumber, jobAddress, depositAmount, packageMinimum } = await req.json();

    // Calculate add-on total and pay-at-closing rate
    const addOnTotal = getAddOnTotal(booking.add_ons);
    const rate = getPayAtClosingRate(booking.package, addOnTotal);
    const rateDisplay = formatPercentage(rate);

    // Generate PDF (same as deposit invoice but with payment received message)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const gold = rgb(0.72, 0.59, 0.42);
    const black = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.5, 0.5, 0.5);
    const green = rgb(0.2, 0.6, 0.2);
    const boldFont = await pdfDoc.embedFont('Helvetica-Bold');
    const regularFont = await pdfDoc.embedFont('Helvetica');

    let y = 750;

    // Header
    page.drawText('ARRIV ESTATE MEDIA', {
      x: 50,
      y,
      size: 20,
      color: black,
      font: boldFont
    });
    y -= 25;

    page.drawText('Deposit Invoice', {
      x: 50,
      y,
      size: 14,
      color: gold,
      font: boldFont
    });
    y -= 15;
    page.drawText('✓ DEPOSIT RECEIVED', {
      x: 50,
      y,
      size: 11,
      color: green,
      font: boldFont
    });
    y -= 35;

    // Invoice details
    page.drawText(`Invoice #: ${invoiceNumber}`, { x: 50, y, size: 10, color: black, font: regularFont });
    y -= 15;
    page.drawText(`Invoice Date: ${new Date().toLocaleDateString()}`, { x: 50, y, size: 10, color: black, font: regularFont });
    y -= 30;

    // Bill to
    page.drawText('BILL TO:', { x: 50, y, size: 10, color: black, font: boldFont });
    y -= 15;
    page.drawText(booking.client_name, { x: 50, y, size: 10, color: black, font: regularFont });
    y -= 15;
    page.drawText(jobAddress, { x: 50, y, size: 10, color: black, font: regularFont });
    y -= 30;

    // Service details
    page.drawText('SERVICE DETAILS', { x: 50, y, size: 10, color: black, font: boldFont });
    y -= 15;
    page.drawText(`Service Date: ${booking.preferred_date}`, { x: 50, y, size: 10, color: black, font: regularFont });
    y -= 15;
    page.drawText(`Package: ${booking.package.replace(/_/g, ' ')}`, { x: 50, y, size: 10, color: black, font: regularFont });
    if (booking.add_ons && booking.add_ons.length > 0) {
      y -= 15;
      page.drawText(`Add-ons: ${booking.add_ons.join(', ')}`, { x: 50, y, size: 9, color: black, font: regularFont });
    }
    y -= 30;

    // Description section
    page.drawText('DESCRIPTION', { x: 50, y, size: 10, color: black, font: boldFont });
    y -= 18;
    page.drawText(`Package Minimum:`, { x: 70, y, size: 9, color: black, font: regularFont });
    page.drawText(`$${packageMinimum.toFixed(2)}`, { x: 450, y, size: 9, color: black, font: regularFont });
    y -= 15;
    page.drawText(`Booking Deposit Received:`, { x: 70, y, size: 9, color: black, font: regularFont });
    page.drawText(`-$${depositAmount.toFixed(2)}`, { x: 450, y, size: 9, color: green, font: regularFont });
    y -= 15;
    page.drawText(`Minimum Due at Closing:`, { x: 70, y, size: 9, color: black, font: regularFont });
    const balanceDue = packageMinimum - depositAmount;
    page.drawText(`$${balanceDue.toFixed(2)} OR ${rateDisplay} of Final Sale Price`, { x: 450, y, size: 8, color: black, font: regularFont });
    y -= 30;

    // Payment Method
    page.drawText('PAYMENT METHOD', { x: 50, y, size: 10, color: black, font: boldFont });
    y -= 15;
    page.drawText('Pay-at-Closing', { x: 70, y, size: 9, color: black, font: regularFont });
    y -= 20;

    // Pay-at-closing rate
    page.drawText('PAY-AT-CLOSING RATE', { x: 50, y, size: 10, color: black, font: boldFont });
    y -= 15;
    page.drawText(rateDisplay, { x: 70, y, size: 9, color: black, font: regularFont });
    y -= 20;

    // Package minimum applies
    page.drawText('PACKAGE MINIMUM APPLIES', { x: 50, y, size: 10, color: black, font: boldFont });
    y -= 15;
    page.drawText(`$${packageMinimum.toFixed(2)}`, { x: 70, y, size: 9, color: black, font: regularFont });
    y -= 30;

    // Amount due
    page.drawText('AMOUNT RECEIVED', { x: 50, y, size: 12, color: green, font: boldFont });
    y -= 20;
    page.drawText(`$${depositAmount.toFixed(2)}`, { x: 70, y, size: 14, color: green, font: boldFont });
    y -= 30;

    // Balance due at closing
    page.drawText('BALANCE DUE AT CLOSING', { x: 50, y, size: 10, color: black, font: boldFont });
    y -= 15;
    page.drawText('Balance due upon successful sale of the property.', { x: 70, y, size: 9, color: black, font: regularFont });
    y -= 30;

    // Pay-at-Closing Terms
    page.drawText('PAY-AT-CLOSING TERMS', { x: 50, y, size: 10, color: black, font: boldFont });
    y -= 15;
    page.drawText('If any of the following occur, this Agreement shall automatically convert to a flat fee of the', { x: 70, y, size: 8, color: black, font: regularFont });
    y -= 12;
    page.drawText('package minimum, with payment due within seven (7) days of written notice (less deposit):', { x: 70, y, size: 8, color: black, font: regularFont });
    y -= 16;
    
    const terms = [
      '• The property is withdrawn, canceled, or expires',
      '• The listing is terminated, transferred, or reassigned to another agent or brokerage',
      '• The property is relisted under a new MLS number',
      '• The seller changes representation',
      '• The property is rented, leased, or otherwise disposed of without a sale',
      '• The sale does not occur within six (6) months of the original listing date',
      '• Payment is not received at closing for any reason'
    ];
    
    terms.forEach(term => {
      if (y < 100) {
        page = pdfDoc.addPage([612, 792]);
        y = 750;
      }
      page.drawText(term, { x: 80, y, size: 8, color: black, font: regularFont });
      y -= 12;
    });

    const pdfBytes = await pdfDoc.save();

    // Upload to Google Drive in Paid folder
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    
    const boundary = 'boundary_' + Date.now();
    const mimeType = 'application/pdf';
    const metadata = {
      name: `Receipt_${invoiceNumber}_Deposit.pdf`,
      mimeType: 'application/pdf'
    };

    const multipartBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      'Content-Transfer-Encoding: base64',
      '',
      btoa(String.fromCharCode(...pdfBytes)),
      `--${boundary}--`
    ].join('\n');

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body: multipartBody
    });

    const uploadedFile = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(`Drive upload failed: ${uploadedFile.error?.message}`);

    const pdfFileId = uploadedFile.id;

    // Make publicly viewable
    await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const { webViewLink: driveViewLink } = await fileDetailsRes.json();

    // Update invoice record
    await base44.asServiceRole.entities.Invoice.update(invoiceId, {
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      google_drive_paid_url: driveViewLink,
      stripe_payment_intent_id: 'manual_pay_at_closing'
    });

    return Response.json({ success: true, invoiceId, receiptUrl: driveViewLink });

  } catch (error) {
    console.error('Error generating pay-at-closing receipt:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});