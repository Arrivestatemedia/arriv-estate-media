import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { PDFDocument, rgb } from 'npm:pdf-lib@^1.17.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);

    // Contractor pricing mapping
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

    // Calculate contractor pay rate
    const packageRate = contractorPackagePricing[booking.package] || 0;
    let addonsTotal = 0;
    
    if (booking.add_ons && Array.isArray(booking.add_ons)) {
      addonsTotal = booking.add_ons.reduce((sum, addon) => {
        return sum + (contractorAddonPricing[addon] || 0);
      }, 0);
    }

    const contractorPayRate = packageRate + addonsTotal;

    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;

    // Check if job already exists for this booking
    const existingJobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    
    if (!existingJobs || existingJobs.length === 0) {
      await base44.asServiceRole.entities.Job.create({
        title: `Photography - ${propertyAddress}`,
        type: 'photo',
        description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
        location: propertyAddress,
        date: booking.preferred_date,
        start_time: booking.preferred_time,
        duration_hours: 2,
        pay_rate: contractorPayRate,
        client_price: booking.total_price,
        status: 'open',
        from_booking: true,
        booking_id: bookingId,
        package: booking.package,
        add_ons: booking.add_ons || [],
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone
      });
    }

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    // Send approval email and calendar invite
    try {
      // Send SMS confirmation
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      
      if (booking.client_phone && twilioPhone && accountSid && authToken) {
        const messageText = `Hi ${booking.client_name}! Your booking at ${propertyAddress} on ${booking.preferred_date} at ${booking.preferred_time} has been confirmed. You'll receive an email shortly. - Arriv`;
        await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
          },
          body: new URLSearchParams({
            'From': twilioPhone,
            'To': booking.client_phone,
            'Body': messageText,
          }).toString(),
        });
      }

      // Send email confirmation via Gmail
      const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'BradCBurke@arrivestatemedia.com';
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      
      const emailSubject = 'Your Booking Confirmation - Arriv';
      const emailBody = `Hi ${booking.client_name},\n\nYour booking has been confirmed!\n\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\n\nYou should receive a calendar invite shortly. We'll contact you if there are any changes.\n\nThank you,\nArriv Team`;
      
      const messageLines = [
        `To: ${booking.client_email}`,
        `From: ${adminEmail}`,
        `Subject: ${emailSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        emailBody
      ];

      const messageParts = messageLines.map(line => new TextEncoder().encode(line + '\r\n'));
      const messageBytes = messageParts.reduce((acc, part) => {
        const newAcc = new Uint8Array(acc.length + part.length);
        newAcc.set(acc);
        newAcc.set(part, acc.length);
        return newAcc;
      }, new Uint8Array());

      const base64urlMessage = btoa(String.fromCharCode(...messageBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64urlMessage })
      });
      
      console.log('[INFO] Sent confirmation email to', booking.client_email);
    } catch (error) {
      console.error('Failed to send notifications:', error);
    }

    // Handle pay-at-closing workflow if applicable
    if (booking.request_pay_at_closing) {
      console.log('[INFO] Pay-at-closing booking detected');
      try {
        // Create Invoice record for deposit
        const invoiceNumber = `INV-PAC-${Date.now()}`;
        const packageMinimumPrices = {
          'mls_walkthrough': 500,
          'photo_essentials': 750,
          'photo_cinematic': 1200,
          'premium_bundle': 1500
        };
        const packageMinimum = packageMinimumPrices[booking.package] || booking.total_price;
        const depositAmount = 50;
        
        const invoice = await base44.asServiceRole.entities.Invoice.create({
          invoice_number: invoiceNumber,
          invoice_type: 'deposit',
          job_id: existingJobs && existingJobs.length > 0 ? existingJobs[0].id : null,
          booking_id: bookingId,
          client_name: booking.client_name,
          client_email: booking.client_email,
          job_address: propertyAddress,
          service_date: booking.preferred_date,
          package: booking.package,
          add_ons: booking.add_ons || [],
          amount: packageMinimum,
          deposit_amount: depositAmount,
          payment_status: 'unpaid',
          pay_at_closing: true,
          pay_at_closing_rate: 0.05,
          package_minimum: packageMinimum
        });
        
        console.log('[INFO] Created Invoice record:', invoice.id);
        
        // Generate PDF and send via Brevo
        await base44.asServiceRole.functions.invoke('generatePayAtClosingDepositInvoiceAndSend', {
          invoiceId: invoice.id,
          booking,
          invoiceNumber,
          jobAddress: propertyAddress,
          depositAmount,
          packageMinimum
        });
        
        console.log('[INFO] Sent deposit invoice PDF email via Brevo');

        // Create ClosingDetection record to monitor for closing
        const jobId = existingJobs && existingJobs.length > 0 ? existingJobs[0].id : null;
        if (jobId) {
          await base44.asServiceRole.entities.ClosingDetection.create({
            job_id: jobId,
            job_address: propertyAddress,
            monitoring_start_date: booking.preferred_date,
            status: 'pending'
          });
          console.log('[INFO] Created ClosingDetection record for monitoring');
        }
      } catch (error) {
        console.error('Failed to handle pay-at-closing workflow:', error);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});