import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb } from 'npm:pdf-lib@^1.17.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { bookingId, actionType } = await req.json();
    
    // Get booking
    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }
    
    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    
    // Create job for the booking
    const contractorPackagePricing = {
      'mls_walkthrough': 60,
      'photo_essentials': 150,
      'photo_cinematic': 250,
      'premium_bundle': 325
    };
    
    const contractorAddonPricing = {
      'drone': 60,
      '3d_tour': 60,
      'twilight': 40,
      'vertical_reel': 25,
      'ai_staging': 0,
      'rush_delivery': 0
    };
    
    const packageRate = contractorPackagePricing[booking.package] || 0;
    let addonsTotal = 0;
    if (booking.add_ons && Array.isArray(booking.add_ons)) {
      addonsTotal = booking.add_ons.reduce((sum, addon) => {
        return sum + (contractorAddonPricing[addon] || 0);
      }, 0);
    }
    
    const contractorPayRate = packageRate + addonsTotal;
    
    // Check if job already exists
    const existingJobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    let jobId = null;
    
    if (!existingJobs || existingJobs.length === 0) {
      const newJob = await base44.asServiceRole.entities.Job.create({
        title: `Photography - ${propertyAddress}`,
        type: 'photo',
        description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
        location: propertyAddress,
        date: booking.preferred_date,
        start_time: booking.preferred_time,
        duration_hours: 2,
        pay_rate: contractorPayRate,
        client_price: booking.total_price,
        status: actionType === 'post_to_job_board' ? 'open' : 'booked',
        from_booking: true,
        booking_id: bookingId,
        package: booking.package,
        add_ons: booking.add_ons || [],
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone,
        ...(actionType === 'accept_for_myself' && {
          booked_by: user.email,
          booked_by_name: user.full_name,
          booked_by_phone: Deno.env.get('ADMIN_PHONE') || ''
        })
      });
      jobId = newJob.id;
    } else {
      jobId = existingJobs[0].id;
    }
    
    // Generate deposit invoice
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
    let lastNumber = 1000;
    if (allInvoices.length > 0 && allInvoices[0].invoice_number) {
      const num = parseInt(allInvoices[0].invoice_number);
      if (!isNaN(num)) {
        lastNumber = num;
      }
    }
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
      job_address: propertyAddress,
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
    
    // Generate PDF using pdf-lib with consistent branding
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    
    const fontSize = 12;
    const smallFontSize = 10;
    const titleFontSize = 18;
    const gold = rgb(0.72, 0.59, 0.42);
    const black = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.4, 0.4, 0.4);
    
    let y = 750;
    
    // Header
    page.drawText('ARRIV ESTATE MEDIA', { x: 50, y, size: titleFontSize, color: gold });
    y -= 30;
    page.drawText('DEPOSIT INVOICE', { x: 50, y, size: 14, color: black });
    page.drawText(`#${invoiceNumber}`, { x: 480, y, size: 14, color: black });
    y -= 25;
    
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
    y -= 20;
    
    // Invoice details
    const invoiceDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    page.drawText(`Date: ${invoiceDate}`, { x: 50, y, size: smallFontSize, color: black });
    y -= 25;
    
    // Bill To
    page.drawText('BILL TO:', { x: 50, y, size: 10, color: gold });
    y -= 15;
    page.drawText(booking.client_name, { x: 50, y, size: fontSize, color: black });
    y -= 15;
    page.drawText(propertyAddress, { x: 50, y, size: fontSize, color: black, maxWidth: 400 });
    y -= 30;
    
    // Services
    page.drawText('DEPOSIT PAYMENT', { x: 50, y, size: 10, color: gold });
    y -= 18;
    page.drawText(`$${depositAmount.toFixed(2)}`, { x: 480, y, size: fontSize, color: black });
    y -= 15;
    
    y -= 15;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
    y -= 25;
    
    // Total
    page.drawText('AMOUNT DUE', { x: 50, y, size: 11, color: gold });
    page.drawText(`$${depositAmount.toFixed(2)}`, { x: 480, y, size: 16, color: black });
    y -= 45;
    
    // Pay-at-Closing Terms section
    page.drawText('PAY-AT-CLOSING TERMS', { x: 50, y, size: 10, color: gold });
    y -= 18;
    
    const termsText = 'If any of the following occur, this Agreement shall automatically convert to a flat fee of the package minimum, with payment due within seven (7) days of written notice (less deposit):';
    const wrappedTerms = termsText.match(/.{1,80}/g) || [];
    wrappedTerms.forEach(line => {
      page.drawText(line, { x: 50, y, size: 9, color: black, maxWidth: 500 });
      y -= 12;
    });
    
    y -= 8;
    const termsList = [
      '1. The property is withdrawn, canceled, or expires',
      '2. The listing is terminated, transferred, or reassigned to another agent or brokerage',
      '3. The property is relisted under a new MLS number',
      '4. The seller changes representation',
      '5. The property is rented, leased, or otherwise disposed of without a sale',
      '6. The sale does not occur within six (6) months of the original listing date',
      '7. Payment is not received at closing for any reason'
    ];
    
    termsList.forEach(term => {
      page.drawText(term, { x: 60, y, size: 8, color: black, maxWidth: 480 });
      y -= 11;
    });
    
    y -= 15;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: gold });
    y -= 20;
    
    // Payment Instructions
    page.drawText('PAYMENT INSTRUCTIONS', { x: 50, y, size: 10, color: gold });
    y -= 18;
    
    const paymentText = 'Deposit payment is required to confirm your booking. Please use the link below to submit payment. Once received, your shoot date will be confirmed.';
    const wrappedPayment = paymentText.match(/.{1,80}/g) || [];
    wrappedPayment.forEach(line => {
      page.drawText(line, { x: 50, y, size: smallFontSize, color: black, maxWidth: 500 });
      y -= 12;
    });
    
    y -= 15;
    page.drawText(`Payment Link: ${stripeData.url}`, { x: 50, y, size: 9, color: rgb(0, 0, 0.8), maxWidth: 500 });
    
    // Footer
    page.drawText('Thank you for your business!', { x: 50, y: 50, size: smallFontSize, color: black });
    page.drawText('Arriv Estate Media | 678-242-9107 | arrivestatemedia.com', { x: 50, y: 30, size: 9, color: gray });
    
    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
    
    // Note: Google Drive upload via connector is performed by the sendInvoiceEmailViaGmail function
    // which handles the full email and document workflow
    
    // Create closing detection record
    await base44.asServiceRole.entities.ClosingDetection.create({
      job_id: jobId,
      job_address: propertyAddress,
      monitoring_start_date: booking.preferred_date,
      status: 'pending'
    });
    
    // Update booking status
    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });
    
    return Response.json({ 
      success: true,
      message: 'Action completed',
      jobId,
      invoiceId: invoice.id,
      invoiceNumber
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});