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
    const bookings = await base44.entities.Booking.filter({ id: bookingId });
    const booking = bookings[0];
    
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

    // Use $1 for test account
    if (booking.client_email === 'BradCBurke@gmail.com') {
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

    // Generate PDF with invoice data (using AI to fill template)
    const invoiceContent = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate invoice content for:
Invoice #: ${invoiceNumber}
Date: ${new Date().toLocaleDateString()}
Client: ${booking.client_name}
Property: ${jobAddress}
Service Date: ${booking.preferred_date}

Package: ${booking.package.replace(/_/g, ' ').toUpperCase()}
Add-ons: ${booking.add_ons ? booking.add_ons.join(', ') : 'None'}

Total Amount: $${totalAmount}

Stripe Payment Link: ${stripeData.url}

Return the formatted text for the invoice body.`,
      response_json_schema: {
        type: "object",
        properties: {
          formatted_content: { type: "string" }
        }
      }
    });

    // Upload invoice to Google Drive UNPAID folder
    const driveResult = await base44.asServiceRole.functions.invoke('uploadInvoiceToGoogleDrive', {
      fileName: `${jobAddress}.pdf`,
      invoiceContent: invoiceContent.formatted_content,
      folderType: 'unpaid',
      invoiceNumber,
      stripeLink: stripeData.url
    });

    // Generate tracked link
    const trackToken = crypto.randomUUID();
    const trackedUrl = `${Deno.env.get('BASE44_APP_DOMAIN')}/t/${trackToken}`;

    // Create invoice record
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
      google_drive_unpaid_url: driveResult.data.fileUrl,
      google_drive_file_id: driveResult.data.fileId,
      tracked_link_token: trackToken,
      tracked_link_url: trackedUrl,
      pay_at_closing: false
    });

    // Send invoice email via Gmail
    await base44.asServiceRole.functions.invoke('sendInvoiceEmailViaGmail', {
      invoiceId: invoice.id,
      clientEmail: booking.client_email,
      clientName: booking.client_name.split(' ')[0],
      jobAddress,
      trackedLink: trackedUrl,
      isReminder: false
    });

    // Schedule reminders
    await base44.asServiceRole.functions.invoke('scheduleInvoiceReminders', {
      invoiceId: invoice.id
    });

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