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

async function generatePayAtClosingDepositPDF(booking, invoiceNumber, jobAddress, depositAmount, packageMinimum) {
  const addOnTotal = getAddOnTotal(booking.add_ons);
  const rate = getPayAtClosingRate(booking.package, addOnTotal);
  const rateDisplay = formatPercentage(rate);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const gold = rgb(0.72, 0.59, 0.42);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.5, 0.5, 0.5);
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
  page.drawText(`Booking Deposit Due:`, { x: 70, y, size: 9, color: black, font: regularFont });
  page.drawText(`$${depositAmount.toFixed(2)}`, { x: 450, y, size: 9, color: black, font: regularFont });
  y -= 15;
  page.drawText(`Minimum Due at Closing:`, { x: 70, y, size: 9, color: black, font: regularFont });
  page.drawText(`$${packageMinimum.toFixed(2)} OR ${rateDisplay} of Final Sale Price`, { x: 450, y, size: 8, color: black, font: regularFont });
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
  page.drawText('TOTAL DUE NOW', { x: 50, y, size: 12, color: gold, font: boldFont });
  y -= 20;
  page.drawText(`$${depositAmount.toFixed(2)}`, { x: 70, y, size: 14, color: gold, font: boldFont });
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

  return await pdfDoc.save();
}

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