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
    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    
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

    // Use $1 for test accounts
    if (booking.client_email === 'BradCBurke@gmail.com' || booking.client_email.includes('test-user')) {
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

    // Simple invoice content
    const invoiceContent = {
      formatted_content: `INVOICE #${invoiceNumber}\nDate: ${new Date().toLocaleDateString()}\n\nClient: ${booking.client_name}\nProperty: ${jobAddress}\nService Date: ${booking.preferred_date}\n\nPackage: ${booking.package.replace(/_/g, ' ').toUpperCase()}\nAdd-ons: ${booking.add_ons ? booking.add_ons.join(', ') : 'None'}\n\nTotal Amount: $${totalAmount}\n\nPayment Link: ${stripeData.url}`
    };

    // Upload invoice to Google Drive UNPAID folder (async, don't block)
    // Don't set initial values - let Drive upload update them
    base44.asServiceRole.functions.invoke('uploadInvoiceToGoogleDrive', {
      fileName: `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.txt`,
      invoiceContent: `INVOICE #${invoiceNumber}\n\nClient: ${booking.client_name}\nProperty: ${jobAddress}\nService Date: ${booking.preferred_date}\n\nAmount Due: $${totalAmount}\n\nPayment Link: ${stripeData.url}`,
      folderType: 'unpaid',
      invoiceNumber,
      stripeLink: stripeData.url
    }).then(driveResult => {
      if (driveResult.data?.fileUrl) {
        base44.asServiceRole.entities.Invoice.update(invoiceId, {
          google_drive_unpaid_url: driveResult.data.fileUrl,
          google_drive_file_id: driveResult.data.fileId
        }).catch(err => console.error('Error updating invoice with Drive URL:', err));
      }
    }).catch(driveError => console.error('Drive upload error:', driveError.message));

    // Generate tracked link
    const trackToken = crypto.randomUUID();
    const trackedUrl = `${Deno.env.get('BASE44_APP_DOMAIN')}/TrackLink?token=${trackToken}`;

    // Create invoice record (Drive URL will be set once upload completes)
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
      tracked_link_token: trackToken,
      tracked_link_url: trackedUrl,
      pay_at_closing: false
    });

    const invoiceId = invoice.id;

    // Send invoice email via Gmail
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      const emailBody = `Hi ${booking.client_name.split(' ')[0]},

    Your invoice for media services at ${jobAddress} is ready. Please use the link below to view the invoice and submit payment at your convenience.

    👉 View Invoice: ${trackedUrl}

    If you have any questions or need anything at all, feel free to reach out. Thank you again for the opportunity to work with you.

    Best regards,
    Bradley Burke
    Arriv Estate Media
    📞 678-242-9107
    🌐 arrivestatemedia.com`;

      const message = [
        `To: ${booking.client_email}`,
        'Subject: Your Invoice from Arriv Estate Media',
        'Content-Type: text/plain; charset=utf-8',
        '',
        emailBody
      ].join('\r\n');

      const encodedMessage = btoa(unescape(encodeURIComponent(message)));

      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encodedMessage })
      });
    } catch (emailError) {
      console.error('Error sending email:', emailError.message);
    }

    // Schedule reminders
    try {
      await base44.functions.invoke('scheduleInvoiceReminders', {
        invoiceId: invoice.id
      });
    } catch (reminderError) {
      console.error('Error scheduling reminders:', reminderError.message);
    }

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