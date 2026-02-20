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
    
    // Send invoice email via Gmail
    const invoiceEmailContent = `
Hello ${booking.client_name},

Your deposit invoice #${invoiceNumber} is ready for payment.

Deposit Amount: $${depositAmount.toFixed(2)}

Property: ${propertyAddress}
Shoot Date: ${booking.preferred_date}

Please click the link below to complete your deposit payment:
${stripeData.url}

Once payment is received, your shoot date will be confirmed.

Best regards,
Arriv Estate Media
678-242-9107
arrivestatemedia.com
    `;

    const gmailHeaders = {
      'Authorization': `Bearer ${await base44.asServiceRole.connectors.getAccessToken('gmail')}`,
      'Content-Type': 'application/json'
    };

    const emailBody = {
      to: booking.client_email,
      subject: `Invoice #${invoiceNumber} - Deposit Payment Required`,
      message: invoiceEmailContent
    };

    // Try to send via Gmail, but don't block if it fails
    try {
      const base64Message = btoa(JSON.stringify(emailBody));
      await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: gmailHeaders,
        body: JSON.stringify({
          raw: base64Message
        })
      });
      console.log('Email sent via Gmail');
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Continue anyway - invoice was created
    }
    
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