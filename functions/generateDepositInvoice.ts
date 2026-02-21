import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Upload to Google Drive and send email
    await base44.asServiceRole.functions.invoke('uploadInvoiceToGoogleDrive', {
      fileName: `${jobAddress}.pdf`,
      invoiceContent: `Deposit Invoice for ${jobAddress}`,
      folderType: 'unpaid',
      invoiceNumber,
      stripeLink: stripeData.url
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