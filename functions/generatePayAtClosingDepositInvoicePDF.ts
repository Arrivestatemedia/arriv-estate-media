import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb } from 'npm:pdf-lib@^1.17.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { invoiceNumber, booking, depositAmount } = await req.json();

    if (!booking || !invoiceNumber || depositAmount === undefined) {
      return Response.json({ error: 'Missing required data' }, { status: 400 });
    }

    const totalAmount = parseFloat(depositAmount);

    // Create Stripe payment link for deposit
    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `Media Services Deposit - ${booking.street_address}`,
        'line_items[0][price_data][unit_amount]': String(Math.round(totalAmount * 100)),
        'line_items[0][quantity]': '1',
      }),
    });

    const stripeData = await stripeResponse.json();
    if (!stripeResponse.ok) {
      throw new Error(`Stripe error: ${stripeData.error?.message || 'Unknown error'}`);
    }

    const packageNames = {
      'mls_walkthrough': 'MLS Walkthrough',
      'photo_essentials': 'Photo Essentials',
      'photo_cinematic': 'Photo + Cinematic Walkthrough',
      'premium_bundle': 'Premium Media Bundle'
    };

    const addonDescriptions = {
      'drone': 'Drone Photography',
      '3d_tour': '3D Virtual Tour',
      'twilight': 'Twilight Photography',
      'rush_delivery': 'Rush Delivery',
      'vertical_reel': 'Vertical Reel',
      'ai_staging': 'AI Staging'
    };

    const jobAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    const addOns = booking.add_ons || [];

    // Generate PDF - EXACT SAME FORMAT as pay-up-front
    console.log('Generating deposit invoice PDF...');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);

    const gold = rgb(0.72, 0.59, 0.42);
    const black = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.4, 0.4, 0.4);

    let y = 750;

    page.drawText('ARRIV ESTATE MEDIA', { x: 50, y, size: 18, color: gold });
    y -= 30;
    page.drawText('DEPOSIT INVOICE', { x: 50, y, size: 14, color: black });
    page.drawText(`#${invoiceNumber}`, { x: 480, y, size: 14, color: black });
    y -= 25;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
    y -= 20;

    const invoiceDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    page.drawText(`Date: ${invoiceDate}`, { x: 50, y, size: 10, color: black });
    y -= 25;

    page.drawText('BILL TO:', { x: 50, y, size: 10, color: gold });
    y -= 15;
    page.drawText(booking.client_name, { x: 50, y, size: 12, color: black });
    y -= 15;
    page.drawText(jobAddress, { x: 50, y, size: 12, color: black, maxWidth: 400 });
    y -= 30;

    page.drawText('SERVICES', { x: 50, y, size: 10, color: gold });
    y -= 15;
    page.drawText(packageNames[booking.package] || booking.package, { x: 50, y, size: 12, color: black });
    y -= 18;

    for (const addon of addOns) {
      page.drawText(`  + ${addonDescriptions[addon] || addon}`, { x: 50, y, size: 10, color: black });
      y -= 14;
    }

    y -= 15;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
    y -= 25;

    page.drawText('DEPOSIT DUE', { x: 50, y, size: 11, color: gold });
    page.drawText(`$${totalAmount.toFixed(2)}`, { x: 480, y, size: 16, color: black });
    y -= 45;

    page.drawText('PAYMENT', { x: 50, y, size: 10, color: gold });
    y -= 15;
    page.drawText('Please use the link below to submit your deposit payment:', { x: 50, y, size: 10, color: black });
    y -= 15;
    page.drawText(stripeData.url, { x: 50, y, size: 9, color: rgb(0, 0, 0.8), maxWidth: 500 });

    page.drawText('Thank you for your business!', { x: 50, y: 50, size: 10, color: black });
    page.drawText('Arriv Estate Media | 678-242-9107 | arrivestatemedia.com', { x: 50, y: 30, size: 9, color: gray });

    const pdfBytes = await pdfDoc.save();
    console.log('PDF generated, size:', pdfBytes.length);

    return Response.json({ 
      pdfBytes: Array.from(pdfBytes),
      stripeUrl: stripeData.url,
      stripePaymentLinkId: stripeData.id
    });
  } catch (error) {
    console.error('Error generating deposit invoice PDF:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});