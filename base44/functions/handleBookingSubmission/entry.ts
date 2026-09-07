import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { booking } = await req.json();

    if (!booking) {
      return Response.json({ error: 'Booking data is required' }, { status: 400 });
    }

    const adminEmail = 'BradCBurke@arrivestatemedia.com';
    const adminName = 'Bradley Burke';
    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    const isPastShoot = !!booking.past_shoot;

    // Create booking in database — auto-approve past shoots
    const createdBooking = await base44.asServiceRole.entities.Booking.create({
      ...booking,
      status: isPastShoot ? 'approved' : 'pending'
    });

    // Calculate canonical pricing via the authoritative engine and create a PricingSnapshot
    let canonicalPricing = null;
    let commissionableServiceValueCents = 0;
    try {
      const pricingRes = await base44.asServiceRole.functions.invoke('calculateFullMediaPricing', {
        package_id: booking.package,
        property_sqft: booking.property_sqft || null,
        add_on_ids: booking.add_ons || [],
        preferred_active: booking.preferred_active || false,
        approved_discount_amount: booking.approved_discount_amount || 0,
        referral_tender_amount: booking.referral_tender_amount || 0,
        contact_id: booking.contact_id || '',
        contact_email: booking.client_email || '',
        sales_member_id: booking.sales_member_id || '',
        payment_timing: booking.request_pay_at_closing ? 'pay_at_closing' : 'pay_up_front',
        property_address: propertyAddress,
        create_snapshot: true,
      });
      if (pricingRes?.data?.status === 'OK') {
        canonicalPricing = pricingRes.data;
        commissionableServiceValueCents = pricingRes.data.pricing?.commissionable_service_value || 0;
        await base44.asServiceRole.entities.Booking.update(createdBooking.id, {
          pricing_snapshot_id: pricingRes.data.pricing_snapshot_id || '',
          property_pricing_tier: pricingRes.data.pricing?.property_pricing_tier || '',
          commissionable_service_value: commissionableServiceValueCents,
          preferred_discount: pricingRes.data.pricing?.preferred_discount || 0,
          approved_discount_amount: pricingRes.data.pricing?.approved_discount_amount || 0,
          referral_tender_amount: pricingRes.data.pricing?.referral_tender_amount || 0,
        });
      }
    } catch (pricingErr) {
      console.error('Canonical pricing calculation error:', pricingErr.message);
    }

    // If this booking came from a sales-rep invite, create a pending commission
    // tied to that rep. Uses the canonical commissionable_service_value from the
    // pricing engine when available; falls back to legacy total_price * 0.15.
    if (booking.sales_member_id) {
      try {
        let repData = null;
        try {
          const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: booking.sales_member_id });
          repData = reps && reps[0] ? reps[0] : null;
        } catch (e) { /* ignore */ }

        let commissionAmount;
        let commissionDescription;
        if (commissionableServiceValueCents > 0) {
          const compData = canonicalPricing?.compensation;
          commissionAmount = compData ? compData.sales_commission / 100 : 0;
          commissionDescription = `${compData?.sales_compensation_rule || 'Commission'} on ${booking.package} booking`;
        } else {
          const baseAmount = parseFloat(booking.total_price) || 0;
          commissionAmount = Math.round(baseAmount * 0.15 * 100) / 100;
          commissionDescription = `15% commission on ${booking.package} booking`;
        }
        if (commissionAmount > 0) {
          await base44.asServiceRole.entities.Commission.create({
            employee_id: booking.sales_member_id,
            employee_email: repData?.email || booking.sales_member_email || '',
            employee_name: repData?.full_name || booking.sales_member_name || '',
            payroll_employee_id: repData?.payroll_employee_id || '',
            compensation_type: 'commission',
            commission_plan_id: 'standard_15',
            deal_id: createdBooking.id,
            customer_name: booking.client_name,
            description: commissionDescription,
            gross_amount: commissionAmount,
            earned_date: new Date().toISOString().slice(0, 10),
            intended_pay_period: new Date().toISOString().slice(0, 7),
            approval_status: 'pending',
            payroll_status: 'not_sent',
            compensation_version: 1,
          });
        }
      } catch (commissionErr) {
        console.error('Commission creation error:', commissionErr.message);
      }
    }

    // For past shoots: create a Job assigned to admin (Bradley) and skip all client/admin notifications
    if (isPastShoot) {
      const packagePrices = { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 };
      const addOnPrices = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
      const addOnsTotal = (booking.add_ons || []).reduce((sum, id) => sum + (addOnPrices[id] || 0), 0);
      const payRate = (packagePrices[booking.package] || 0) + addOnsTotal;

      try {
        await base44.asServiceRole.entities.Job.create({
          title: `${booking.package} – ${propertyAddress}`,
          type: booking.package === 'mls_walkthrough' ? 'video' : (booking.package === 'photo_essentials' ? 'photo' : 'photo_video'),
          location: propertyAddress,
          date: booking.preferred_date,
          start_time: booking.preferred_time,
          pay_rate: payRate,
          client_price: parseFloat(booking.total_price),
          status: 'completed',
          media_partner_status: 'job_completed',
          booked_by: adminEmail,
          booked_by_name: adminName,
          client_name: booking.client_name,
          client_email: booking.client_email,
          client_phone: booking.client_phone || '',
          package: booking.package,
          add_ons: booking.add_ons || [],
          notes: booking.notes || '',
          from_booking: true,
          booking_id: createdBooking.id,
          footage_uploaded: true,
        });
      } catch (jobErr) {
        console.error('Job creation error (past shoot):', jobErr.message);
      }

      // Skip to invoice generation — fall through to the invoice block below
    }

    // Send admin notification email via Gmail (skip for past shoots)
    if (!isPastShoot) try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      const emailSubject = `New Booking Request - ${booking.client_name}`;
      const payAtClosingNote = booking.request_pay_at_closing ? '\n\n⚠️ CLIENT REQUESTED PAY-AT-CLOSING' : '';
      const emailBody = `New Booking Request\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\nTotal Price: $${booking.total_price}\nNotes: ${booking.notes || 'None'}${payAtClosingNote}\n\nView and manage this booking in your admin dashboard.`;

      const messageLines = [
        `To: ${adminEmail}`,
        `From: ${adminEmail}`,
        `Subject: ${emailSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        emailBody
      ];
      const messageBytes = messageLines.map(l => new TextEncoder().encode(l + '\r\n')).reduce((acc, part) => {
        const merged = new Uint8Array(acc.length + part.length);
        merged.set(acc); merged.set(part, acc.length);
        return merged;
      }, new Uint8Array());
      const base64urlMessage = btoa(String.fromCharCode(...messageBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: base64urlMessage })
      });

      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email', recipient_type: 'admin', recipient_email: adminEmail,
        message_content: emailBody, subject: emailSubject,
        status: response.ok ? 'success' : 'failed'
      });
    } catch (error) {
      console.error('Admin email error:', error);
    }

    // For pay-up-front: send booking confirmation email first (skip for past shoots)
    if (!booking.request_pay_at_closing) {
      // Send booking confirmation email via Gmail (skip for past shoots)
      if (!isPastShoot) try {
        const firstName = booking.client_name.split(' ')[0];
        const packageNames = { mls_walkthrough: 'MLS Walkthrough', photo_essentials: 'Photo Essentials Package', photo_cinematic: 'Photo + Cinematic Walkthrough', premium_bundle: 'Premium Bundle Package' };
        const addOnsList = (booking.add_ons || []).map(addon => {
          const addonDesc = { drone: 'Drone Photography', '3d_tour': '3D Virtual Tour', twilight: 'Twilight Photography', rush_delivery: 'Rush Delivery', vertical_reel: 'Vertical Reel', ai_staging: 'AI Staging' };
          return addonDesc[addon] || addon;
        }).join(', ');
        const packageAndAddons = addOnsList ? `${packageNames[booking.package]} + ${addOnsList}` : packageNames[booking.package];
        
        const confirmationHtmlBody = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Thank you for your booking request!</p>
  <p>We've received your request for:</p>
  <ul style="line-height: 2;">
    <li><strong>Package:</strong> ${packageAndAddons}</li>
    <li><strong>Property:</strong> ${propertyAddress}</li>
    <li><strong>Preferred Date:</strong> ${booking.preferred_date}</li>
    <li><strong>Preferred Time:</strong> ${booking.preferred_time}</li>
    <li><strong>Total Price:</strong> $${booking.total_price}</li>
  </ul>
  <p>Once your invoice is paid, your booking will be confirmed.</p>
  <p>Thank you for choosing Arriv Estate Media!</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body></html>`;
        
        const gmailToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
        const emailSubject = 'Your Booking Request Confirmation';
        const messageLines = [
          `To: ${booking.client_email}`, `From: ${adminEmail}`, `Subject: ${emailSubject}`,
          'MIME-Version: 1.0', 'Content-Type: text/html; charset="UTF-8"', '', confirmationHtmlBody
        ];
        const messageBytes = messageLines.map(l => new TextEncoder().encode(l + '\r\n')).reduce((acc, part) => {
          const merged = new Uint8Array(acc.length + part.length);
          merged.set(acc); merged.set(part, acc.length);
          return merged;
        }, new Uint8Array());
        const base64urlMessage = btoa(String.fromCharCode(...messageBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        console.log('Sending confirmation email via Gmail to:', booking.client_email);
        const gmailRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${gmailToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: base64urlMessage })
        });
        
        const gmailData = await gmailRes.json();
        console.log('Gmail response status:', gmailRes.status, 'data:', JSON.stringify(gmailData).substring(0, 200));
        
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client', recipient_email: booking.client_email,
          message_content: 'Booking confirmation sent', subject: emailSubject,
          status: gmailRes.ok ? 'success' : 'failed',
          error_message: gmailRes.ok ? null : JSON.stringify(gmailData)
        });
      } catch (error) {
        console.error('Confirmation email error:', error);
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client', recipient_email: booking.client_email,
          message_content: 'Booking confirmation failed', subject: 'Your Booking Request Confirmation',
          status: 'failed', error_message: error.message
        });
      }

      // Now generate invoice (separate try/catch)
      try {
        // Send SMS to admin via Twilio (skip for past shoots)
        if (!isPastShoot) try {
          const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
          const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
          const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
          const adminPhone = Deno.env.get('ADMIN_PHONE');
          const smsMessage = `NEW BOOKING REQUEST\n\nClient: ${booking.client_name}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\nTotal: $${booking.total_price}`;

          const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ From: fromPhone, To: adminPhone, Body: smsMessage }).toString(),
          });

          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'sms', recipient_type: 'admin', recipient_phone: adminPhone,
            message_content: smsMessage, status: smsResponse.ok ? 'success' : 'failed'
          });
        } catch (error) {
          console.error('Admin SMS error:', error);
        }

        const totalAmount = parseFloat(booking.total_price);


        // Invoice number
        const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1);
        const lastNumber = allInvoices.length > 0 && allInvoices[0].invoice_number
          ? parseInt(allInvoices[0].invoice_number) : 1000;
        const invoiceNumber = String(lastNumber + 1);

        // Use $1 for test accounts
        const testEmails = ['bradcburke@gmail.com', 'bradcburke5@gmail.com'];
        const isTestAccount = testEmails.includes(booking.client_email.toLowerCase()) || booking.client_email.toLowerCase().includes('test-user');
        const chargeAmount = isTestAccount ? 1 : totalAmount;

        // Stripe payment link
        const stripeResponse = await fetch('https://api.stripe.com/v1/payment_links', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][product_data][name]': `Media Services - ${booking.street_address}`,
            'line_items[0][price_data][unit_amount]': String(Math.round(chargeAmount * 100)),
            'line_items[0][quantity]': '1',
          }),
        });
        const stripeData = await stripeResponse.json();
        if (!stripeResponse.ok) throw new Error(`Stripe error: ${stripeData.error?.message}`);

        const packagePrices = { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 };
        const basePkgAmount = packagePrices[booking.package] || 0;
        const addOns = booking.add_ons || [];

        const stripeUrl = stripeData.url;
        console.log('Stripe URL:', stripeUrl);

        // Fetch logo (transparent PNG - looks great on dark header)
        let logoBase64 = null;
        try {
          const logoRes = await fetch('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png');
          if (logoRes.ok) {
            const logoBuffer = await logoRes.arrayBuffer();
            const logoBytes = new Uint8Array(logoBuffer);
            let b64 = '';
            const chunkSize = 1024;
            for (let i = 0; i < logoBytes.length; i += chunkSize) {
              b64 += String.fromCharCode(...logoBytes.subarray(i, i + chunkSize));
            }
            logoBase64 = btoa(b64);
            console.log('Logo fetched, size:', logoBytes.length);
          }
        } catch (e) {
          console.warn('Logo fetch failed:', e.message);
        }

        // Generate PDF using jsPDF - consistent branded layout
        console.log('Generating PDF with jsPDF...');
        const { jsPDF } = await import('npm:jspdf@2.5.1');
        const doc = new jsPDF({ unit: 'pt', format: 'letter' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 60;

        // Cream page background
        doc.setFillColor(255, 251, 245);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // Logo on cream background - use real image dimensions for correct aspect ratio
        const logoH = 175;
        let curY = 0;
        if (logoBase64) {
          const imgData = `data:image/png;base64,${logoBase64}`;
          const imgProps = doc.getImageProperties(imgData);
          const logoW = (imgProps.width / imgProps.height) * logoH;
          doc.addImage(imgData, 'PNG', (pageWidth - logoW) / 2, curY, logoW, logoH);
          curY += logoH - 55; // Pull line up to account for PNG bottom transparent padding
        } else {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(26);
          doc.setTextColor(26, 26, 26);
          doc.text('ARRIV', pageWidth / 2, curY + 30, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(184, 149, 106);
          doc.text('ESTATE MEDIA', pageWidth / 2, curY + 46, { align: 'center' });
          curY += 60;
        }

        // Thin gold divider under logo
        doc.setDrawColor(184, 149, 106);
        doc.setLineWidth(1);
        doc.line(margin, curY, pageWidth - margin, curY);
        curY += 50;

        // INVOICE title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(26, 26, 26);
        doc.text('INVOICE', margin, curY);
        curY += 18;

        // Invoice # and Date
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        doc.text(`Invoice #: ${invoiceNumber}`, margin, curY);
        curY += 14;
        doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' })}`, margin, curY);
        curY += 26;

        // BILL TO
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(26, 26, 26);
        doc.text('BILL TO:', margin, curY);
        curY += 15;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(booking.client_name, margin, curY);
        curY += 17;

        doc.setTextColor(184, 149, 106);
        doc.text('Listing Address:', margin, curY);
        curY += 15;

        doc.setTextColor(80, 80, 80);
        doc.text(propertyAddress, margin, curY);
        curY += 15;
        doc.text(`Service Date: ${booking.preferred_date}`, margin, curY);

        // Divider
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        curY += 20;
        doc.line(margin, curY, pageWidth - margin, curY);
        curY += 20;

        // SERVICES PROVIDED
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(184, 149, 106);
        doc.text('SERVICES PROVIDED', margin, curY);
        curY += 10;

        doc.setDrawColor(200, 200, 200);
        doc.line(margin, curY, pageWidth - margin, curY);
        curY += 13;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(26, 26, 26);
        doc.text('Description', margin, curY);
        doc.text('Amount', pageWidth - margin, curY, { align: 'right' });
        curY += 7;
        doc.line(margin, curY, pageWidth - margin, curY);
        curY += 15;

        // Line items
        const addonPrices2 = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
        const addonDescriptions2 = { drone: 'Drone Photography', '3d_tour': '3D Virtual Tour', twilight: 'Twilight Photography', rush_delivery: 'Rush Delivery', vertical_reel: 'Vertical Reel', ai_staging: 'AI Staging' };
        const pkgNames = { mls_walkthrough: 'MLS Walkthrough', photo_essentials: 'Photo Essentials Package', photo_cinematic: 'Photo + Cinematic Walkthrough', premium_bundle: 'Premium Bundle Package' };

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        let y = curY;

        // Package name + price on first line
        doc.text(pkgNames[booking.package] || booking.package, margin, y);
        doc.text(`$${basePkgAmount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
        y += 16;

        // List package features as sub-items if provided
        if (booking.package_features && booking.package_features.length > 0) {
          doc.setFontSize(8.5);
          doc.setTextColor(120, 120, 120);
          for (const feature of booking.package_features) {
            doc.text(`  • ${feature}`, margin + 8, y);
            y += 12;
          }
          doc.setFontSize(10);
          doc.setTextColor(80, 80, 80);
        }
        y += 4;

        for (const addon of addOns) {
          const price = addonPrices2[addon] || 0;
          doc.text(addonDescriptions2[addon] || addon, margin, y);
          doc.text(`$${price.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
          y += 18;
        }

        // Total
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 14;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(26, 26, 26);
        doc.text('TOTAL DUE:', margin, y);
        doc.setTextColor(184, 149, 106);
        doc.text(`$${totalAmount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
        y += 30;

        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 20;

        // PAYMENT INSTRUCTIONS
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(26, 26, 26);
        doc.text('PAYMENT INSTRUCTIONS', margin, y);
        y += 16;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text('Full payment is required for your shoot to be confirmed.', margin, y);
        y += 16;

        const linkLabel = 'Payment Link: ';
        doc.text(linkLabel, margin, y);
        const labelWidth = doc.getTextWidth(linkLabel);
        doc.setTextColor(184, 149, 106);
        doc.textWithLink(stripeUrl, margin + labelWidth, y, { url: stripeUrl });

        // Refund policy anchored just above the footer
        const refundText = 'Arriv Estate Media LLC is committed to delivering high-quality media and offers revisions or reshoots when necessary to meet expectations. Due to the time and production involved, completed services are generally non-refundable. However, partial refunds may be issued at ARRIV\'s discretion. Media usage rights are granted upon full payment. In the event of a refund, usage rights may be adjusted accordingly.';
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 120);
        const refundLines = doc.splitTextToSize(refundText, pageWidth - margin * 2);
        const refundBlockHeight = refundLines.length * 9 + 14; // line height ~9pt + label gap
        const refundY = pageHeight - 55 - 10 - refundBlockHeight;
        doc.setFont('helvetica', 'bold');
        doc.text('*Refund Policy', margin, refundY);
        doc.setFont('helvetica', 'normal');
        doc.text(refundLines, margin, refundY + 12);

        // Footer - dark bar at bottom
        doc.setFillColor(26, 26, 26);
        doc.rect(0, pageHeight - 55, pageWidth, 55, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(184, 149, 106);
        doc.text('Arriv Estate Media LLC | Professional Property Photography & Videography', pageWidth / 2, pageHeight - 28, { align: 'center' });

        const pdfBytes = new Uint8Array(doc.output('arraybuffer'));
        console.log('PDF generated, size:', pdfBytes.length);

        // Upload PDF to Google Drive UNPAID folder
        const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
        const unpaidFolderId = '1PMtihUlPa_LRcxYdi4ZDNeWWF2zfdv7J';
        const enc = new TextEncoder();
        const boundary = 'boundary_arriv_invoice';

        // Upload the final PDF to the UNPAID folder
        console.log('Starting PDF upload to UNPAID folder, PDF size:', pdfBytes.length, 'bytes');
        let uploadedPdf;
        try {
          const pdfFileName = `Invoice_${invoiceNumber}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;
          console.log('PDF filename:', pdfFileName);
          
          const pdfMetadata = JSON.stringify({ name: pdfFileName, parents: [unpaidFolderId], mimeType: 'application/pdf' });
          const pdfBefore = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${pdfMetadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`);
          const pdfAfter = enc.encode(`\r\n--${boundary}--`);
          const pdfUploadBody = new Uint8Array(pdfBefore.length + pdfBytes.length + pdfAfter.length);
          pdfUploadBody.set(pdfBefore);
          pdfUploadBody.set(pdfBytes, pdfBefore.length);
          pdfUploadBody.set(pdfAfter, pdfBefore.length + pdfBytes.length);
          console.log('PDF multipart body assembled, total size:', pdfUploadBody.length);
  
          const pdfUploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
            body: pdfUploadBody
          });
          console.log('PDF upload response status:', pdfUploadRes.status);
          
          uploadedPdf = await pdfUploadRes.json();
          console.log('PDF upload response:', JSON.stringify(uploadedPdf).substring(0, 200));
          
          if (!pdfUploadRes.ok) {
            console.error('PDF upload failed, response:', uploadedPdf);
            throw new Error(`PDF upload failed: ${pdfUploadRes.status} ${JSON.stringify(uploadedPdf.error)}`);
          }
          if (!uploadedPdf.id) {
            console.error('PDF upload succeeded but no file ID returned:', uploadedPdf);
            throw new Error('PDF uploaded but no file ID returned');
          }
          console.log('PDF uploaded successfully:', uploadedPdf.id);
        } catch (error) {
          console.error('PDF upload error:', error.message);
          throw error;
        }

        const pdfFileId = uploadedPdf.id;
        console.log('Setting PDF permissions to public...');
        try {
          const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          });
          if (!permRes.ok) {
            console.warn('Warning: Failed to set public permissions, continuing anyway');
          } else {
            console.log('PDF permissions set to public');
          }
        } catch (error) {
          console.warn('Warning: Error setting permissions:', error.message);
        }

        console.log('Getting PDF share link...');
        let driveViewLink;
        try {
          const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, {
            headers: { 'Authorization': `Bearer ${driveToken}` }
          });
          if (!fileDetailsRes.ok) {
            throw new Error(`Failed to get file details: ${fileDetailsRes.status}`);
          }
          const fileDetails = await fileDetailsRes.json();
          driveViewLink = fileDetails.webViewLink;
          console.log('Drive PDF link:', driveViewLink);
          if (!driveViewLink) {
            throw new Error('No webViewLink returned from Google Drive');
          }
        } catch (error) {
          console.error('Error getting PDF link:', error.message);
          throw error;
        }

        // Send invoice email via Brevo
        console.log('Preparing Brevo email...');
        const brevoApiKey = Deno.env.get('BREVO_API_KEY');
        if (!brevoApiKey) {
          throw new Error('BREVO_API_KEY not set');
        }
        const firstName = booking.client_name.split(' ')[0];
        const htmlEmailBody = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Your invoice for media services at <strong>${propertyAddress}</strong> is ready. Please use the link below to view your invoice and submit payment at your convenience.</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${driveViewLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">👉 View Invoice</a>
  </p>
  <p>If you have any questions, feel free to reach out.</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body></html>`;

        console.log('Sending invoice email via Brevo to:', booking.client_email);
        let brevoResponse;
        let brevoData;
        try {
          brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
              to: [{ email: booking.client_email, name: booking.client_name }],
              subject: 'Your Invoice from Arriv Estate Media',
              htmlContent: htmlEmailBody
            })
          });
          console.log('Brevo response status:', brevoResponse.status);
          
          brevoData = await brevoResponse.json();
          console.log('Brevo response:', JSON.stringify(brevoData).substring(0, 200));
          
          if (!brevoResponse.ok) {
            console.error('Brevo API error:', brevoData);
            throw new Error(`Brevo error: ${brevoResponse.status} ${brevoData.message || JSON.stringify(brevoData)}`);
          }
          console.log('Invoice email sent successfully, messageId:', brevoData.messageId);
        } catch (error) {
          console.error('Brevo email error:', error.message);
          throw error;
        }

        // Get checkout session ID from payment link
        console.log('Fetching payment link details to get checkout session ID...');
        let checkoutSessionId;
        try {
          const linkDetailsRes = await fetch(`https://api.stripe.com/v1/payment_links/${stripeData.id}`, {
            headers: {
              'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`
            }
          });
          const linkDetails = await linkDetailsRes.json();
          console.log('Payment link details:', linkDetails.url);
          // Note: Payment Links don't directly give us session ID, we'll rely on matching by link ID
          // But let's store both for redundancy
        } catch (e) {
          console.warn('Could not fetch link details:', e.message);
        }

        // Save invoice record with all data
        console.log('Creating invoice record...');
        let invoice;
        try {
          invoice = await base44.asServiceRole.entities.Invoice.create({
            invoice_number: invoiceNumber,
            invoice_type: 'pay_up_front',
            booking_id: createdBooking.id,
            client_name: booking.client_name,
            client_email: booking.client_email,
            job_address: propertyAddress,
            service_date: booking.preferred_date,
            package: booking.package,
            add_ons: addOns,
            amount: chargeAmount,
            payment_status: 'unpaid',
            stripe_payment_link_id: stripeData.id,
            stripe_payment_link_url: stripeData.url,
            google_drive_unpaid_url: driveViewLink,
            google_drive_file_id: pdfFileId,
            pay_at_closing: false,
            email_sent_at: new Date().toISOString()
          });
          console.log('Invoice created successfully:', invoice.id);
        } catch (error) {
          console.error('Error creating invoice record:', error.message);
          throw error;
        }

        // Log success
        console.log('Logging message success...');
        try {
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email', recipient_type: 'client',
            recipient_email: booking.client_email,
            message_content: `Invoice #${invoiceNumber} sent for ${propertyAddress}`,
            subject: 'Your Invoice from Arriv Estate Media',
            status: 'success'
          });
          console.log('Message log created');
        } catch (error) {
          console.error('Error logging message:', error.message);
        }

        // Update booking with invoice ID and lock until payment
        console.log('Updating booking with invoice ID and locking...');
        try {
          await base44.asServiceRole.entities.Booking.update(createdBooking.id, { invoice_id: invoice.id, payment_locked: true });
          console.log('Booking updated with invoice ID and locked');
        } catch (error) {
          console.error('Error updating booking:', error.message);
        }

      } catch (invoiceError) {
        console.error('Invoice generation error:', invoiceError);
        // Confirmation email already sent, just log the invoice error
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client',
          recipient_email: booking.client_email,
          message_content: `Invoice generation failed`,
          subject: 'Invoice Generation Error',
          status: 'failed',
          error_message: invoiceError.message
        });
      }

    } else if (!isPastShoot) {
      // Pay-at-closing: send simple confirmation via Gmail (skip for past shoots)
      try {
        const exactPrice = commissionableServiceValueCents > 0
          ? `$${(commissionableServiceValueCents / 100).toFixed(2)}`
          : `$${booking.total_price}`;
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
        const emailSubject = 'Your Booking Request Confirmation';
        const emailBody = `Thank you for your booking request!\n\nWe've received your request for:\n\nPackage: ${booking.package}\nProperty: ${propertyAddress}\nPreferred Date: ${booking.preferred_date}\nPreferred Time: ${booking.preferred_time}\nService Total: ${exactPrice}\n\nYour payment will be collected at closing. We'll be in touch to confirm the details.\n\nThank you!`;

        const messageLines = [
          `To: ${booking.client_email}`, `From: ${adminEmail}`, `Subject: ${emailSubject}`,
          'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', '', emailBody
        ];
        const messageBytes = messageLines.map(l => new TextEncoder().encode(l + '\r\n')).reduce((acc, part) => {
          const merged = new Uint8Array(acc.length + part.length);
          merged.set(acc); merged.set(part, acc.length);
          return merged;
        }, new Uint8Array());
        const base64urlMessage = btoa(String.fromCharCode(...messageBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: base64urlMessage })
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client', recipient_email: booking.client_email,
          message_content: emailBody, subject: emailSubject,
          status: response.ok ? 'success' : 'failed'
        });
      } catch (error) {
        console.error('Pay-at-closing confirmation email error:', error);
      }

      // SMS to admin
      try {
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
        const adminPhone = Deno.env.get('ADMIN_PHONE');
        const exactPrice = commissionableServiceValueCents > 0
          ? `$${(commissionableServiceValueCents / 100).toFixed(2)}`
          : `$${booking.total_price}`;
        const smsMessage = `PAY-AT-CLOSING REQUESTED\n\nClient: ${booking.client_name}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nPackage: ${booking.package}\nTotal: ${exactPrice}`;

        const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: fromPhone, To: adminPhone, Body: smsMessage }).toString(),
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'sms', recipient_type: 'admin', recipient_phone: adminPhone,
          message_content: smsMessage, status: smsResponse.ok ? 'success' : 'failed'
        });
      } catch (error) {
        console.error('Admin SMS error:', error);
      }
    }

    return Response.json({ success: true, booking: createdBooking });
  } catch (error) {
    console.error('Booking submission error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});