import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const pending = await base44.asServiceRole.entities.ScheduledBooking.filter({ status: 'pending' });

    const due = pending.filter(sb => new Date(sb.scheduled_submit_at) <= now);

    const results = [];

    for (const sb of due) {
      try {
        const packagePrices = { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 };
        const addOnPrices = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
        const pkgPrice = sb.custom_package_price != null ? sb.custom_package_price : (packagePrices[sb.package_id] || 0);
        const addOnsTotal = (sb.add_on_ids || []).reduce((sum, id) => sum + (addOnPrices[id] || 0), 0);
        const totalPrice = pkgPrice + addOnsTotal;

        const propertyAddress = `${sb.street_address}, ${sb.city}, ${sb.state}`;
        const adminEmail = 'BradCBurke@arrivestatemedia.com';
        const adminName = 'Bradley Burke';

        // Determine if the shoot date is in the past OR if auto-send media is configured
        const [py, pm, pd] = sb.preferred_date.split('-').map(Number);
        const shootDate = new Date(py, pm - 1, pd);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const isPastShoot = shootDate < today || !!sb.scheduled_media_message_id;

        // Create the Booking record directly (service role, no auth needed)
        const createdBooking = await base44.asServiceRole.entities.Booking.create({
          client_name: sb.client_name,
          client_email: sb.client_email,
          client_phone: sb.client_phone || '',
          street_address: sb.street_address,
          city: sb.city,
          state: sb.state,
          preferred_date: sb.preferred_date,
          preferred_time: sb.preferred_time,
          notes: sb.notes || '',
          package: sb.package_id,
          add_ons: sb.add_on_ids || [],
          request_pay_at_closing: sb.request_pay_at_closing || false,
          total_price: totalPrice,
          status: isPastShoot ? 'approved' : 'pending',
        });

        // For past shoots: create a completed Job assigned to admin and skip all notifications
        if (isPastShoot) {
          const addOnsForJob = sb.add_on_ids || [];
          const addOnTotal = addOnsForJob.reduce((sum, id) => sum + (addOnPrices[id] || 0), 0);
          const payRate = pkgPrice + addOnTotal;

          await base44.asServiceRole.entities.Job.create({
            title: `${sb.package_id} – ${propertyAddress}`,
            type: sb.package_id === 'mls_walkthrough' ? 'video' : (sb.package_id === 'photo_essentials' ? 'photo' : 'photo_video'),
            location: propertyAddress,
            date: sb.preferred_date,
            start_time: sb.preferred_time,
            pay_rate: payRate,
            client_price: totalPrice,
            status: 'completed',
            media_partner_status: 'job_completed',
            booked_by: adminEmail,
            booked_by_name: adminName,
            client_name: sb.client_name,
            client_email: sb.client_email,
            client_phone: sb.client_phone || '',
            package: sb.package_id,
            add_ons: addOnsForJob,
            notes: sb.notes || '',
            from_booking: true,
            booking_id: createdBooking.id,
            footage_uploaded: true,
          });

          // Now generate invoice for past shoot via handleBookingSubmission's invoice logic
          // We do this by invoking it with a service-role compatible approach — pass straight to invoice function
          // Actually just call the invoice generation inline here:
          const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1);
          const lastNumber = allInvoices.length > 0 && allInvoices[0].invoice_number ? parseInt(allInvoices[0].invoice_number) : 1000;
          const invoiceNumber = String(lastNumber + 1);

          const testEmails = ['bradcburke@gmail.com', 'bradcburke5@gmail.com'];
          const isTestAccount = testEmails.includes(sb.client_email.toLowerCase());
          const chargeAmount = isTestAccount ? 1 : totalPrice;

          // Stripe payment link
          const stripeResponse = await fetch('https://api.stripe.com/v1/payment_links', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              'line_items[0][price_data][currency]': 'usd',
              'line_items[0][price_data][product_data][name]': `Media Services - ${sb.street_address}`,
              'line_items[0][price_data][unit_amount]': String(Math.round(chargeAmount * 100)),
              'line_items[0][quantity]': '1',
            }),
          });
          const stripeData = await stripeResponse.json();
          if (!stripeResponse.ok) throw new Error(`Stripe error: ${stripeData.error?.message}`);

          // Generate PDF with full branded layout
          const { jsPDF } = await import('npm:jspdf@2.5.1');
          const doc = new jsPDF({ unit: 'pt', format: 'letter' });
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const margin = 60;

          // Cream background
          doc.setFillColor(255, 251, 245);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');

          // Fetch logo
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
            }
          } catch (e) { /* skip logo if unavailable */ }

          const logoH = 175;
          let curY = 0;
          if (logoBase64) {
            const imgData = `data:image/png;base64,${logoBase64}`;
            const imgProps = doc.getImageProperties(imgData);
            const logoW = (imgProps.width / imgProps.height) * logoH;
            doc.addImage(imgData, 'PNG', (pageWidth - logoW) / 2, curY, logoW, logoH);
            curY += logoH - 55;
          } else {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(26, 26, 26);
            doc.text('ARRIV', pageWidth / 2, curY + 30, { align: 'center' });
            curY += 60;
          }

          // Gold divider
          doc.setDrawColor(184, 149, 106); doc.setLineWidth(1);
          doc.line(margin, curY, pageWidth - margin, curY); curY += 50;

          // INVOICE title
          doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(26, 26, 26);
          doc.text('INVOICE', margin, curY); curY += 18;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(80, 80, 80);
          doc.text(`Invoice #: ${invoiceNumber}`, margin, curY); curY += 14;
          doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`, margin, curY); curY += 26;

          doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
          doc.text('BILL TO:', margin, curY); curY += 15;
          doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
          doc.text(sb.client_name, margin, curY); curY += 17;
          doc.setTextColor(184, 149, 106); doc.text('Listing Address:', margin, curY); curY += 15;
          doc.setTextColor(80, 80, 80); doc.text(propertyAddress, margin, curY); curY += 15;
          doc.text(`Service Date: ${sb.preferred_date}`, margin, curY); curY += 20;

          doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
          doc.line(margin, curY, pageWidth - margin, curY); curY += 20;

          doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(184, 149, 106);
          doc.text('SERVICES PROVIDED', margin, curY); curY += 10;
          doc.setDrawColor(200, 200, 200); doc.line(margin, curY, pageWidth - margin, curY); curY += 13;
          doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
          doc.text('Description', margin, curY); doc.text('Amount', pageWidth - margin, curY, { align: 'right' }); curY += 7;
          doc.line(margin, curY, pageWidth - margin, curY); curY += 15;

          const pkgNames = { mls_walkthrough: 'MLS Walkthrough', photo_essentials: 'Photo Essentials Package', photo_cinematic: 'Photo + Cinematic Walkthrough', premium_bundle: 'Premium Bundle Package' };
          const addonDesc = { drone: 'Drone Photography', '3d_tour': '3D Virtual Tour', twilight: 'Twilight Photography', rush_delivery: 'Rush Delivery', vertical_reel: 'Vertical Reel', ai_staging: 'AI Staging' };

          doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
          doc.text(pkgNames[sb.package_id] || sb.package_id, margin, curY);
          doc.text(`$${pkgPrice.toFixed(2)}`, pageWidth - margin, curY, { align: 'right' }); curY += 16;

          if (sb.package_features && sb.package_features.length > 0) {
            doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
            for (const f of sb.package_features) { doc.text(`  • ${f}`, margin + 8, curY); curY += 12; }
            doc.setFontSize(10); doc.setTextColor(80, 80, 80);
          }
          curY += 4;

          for (const addon of (sb.add_on_ids || [])) {
            doc.text(addonDesc[addon] || addon, margin, curY);
            doc.text(`$${(addOnPrices[addon] || 0).toFixed(2)}`, pageWidth - margin, curY, { align: 'right' }); curY += 18;
          }

          doc.setDrawColor(200, 200, 200); doc.line(margin, curY, pageWidth - margin, curY); curY += 14;
          doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26); doc.text('TOTAL DUE:', margin, curY);
          doc.setTextColor(184, 149, 106); doc.text(`$${totalPrice.toFixed(2)}`, pageWidth - margin, curY, { align: 'right' }); curY += 30;
          doc.setDrawColor(200, 200, 200); doc.line(margin, curY, pageWidth - margin, curY); curY += 20;

          doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 26, 26);
          doc.text('PAYMENT INSTRUCTIONS', margin, curY); curY += 16;
          doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
          doc.text('Full payment is required for your shoot to be confirmed.', margin, curY); curY += 16;
          const linkLabel = 'Payment Link: ';
          doc.text(linkLabel, margin, curY);
          const labelWidth = doc.getTextWidth(linkLabel);
          doc.setTextColor(184, 149, 106);
          doc.textWithLink(stripeData.url, margin + labelWidth, curY, { url: stripeData.url });

          // Refund policy
          const refundText = 'Arriv Estate Media LLC is committed to delivering high-quality media and offers revisions or reshoots when necessary to meet expectations. Due to the time and production involved, completed services are generally non-refundable. However, partial refunds may be issued at ARRIV\'s discretion.';
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
          const refundLines = doc.splitTextToSize(refundText, pageWidth - margin * 2);
          const refundBlockHeight = refundLines.length * 9 + 14;
          const refundY = pageHeight - 55 - 10 - refundBlockHeight;
          doc.setFont('helvetica', 'bold'); doc.text('*Refund Policy', margin, refundY);
          doc.setFont('helvetica', 'normal'); doc.text(refundLines, margin, refundY + 12);

          // Footer
          doc.setFillColor(26, 26, 26); doc.rect(0, pageHeight - 55, pageWidth, 55, 'F');
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(184, 149, 106);
          doc.text('Arriv Estate Media LLC | Professional Property Photography & Videography', pageWidth / 2, pageHeight - 28, { align: 'center' });

          const pdfBytes = new Uint8Array(doc.output('arraybuffer'));

          // Upload to Google Drive
          const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
          const unpaidFolderId = '1PMtihUlPa_LRcxYdi4ZDNeWWF2zfdv7J';
          const enc = new TextEncoder();
          const boundary = 'boundary_arriv_invoice';
          const pdfFileName = `Invoice_${invoiceNumber}_${sb.client_name.replace(/\s+/g, '_')}.pdf`;
          const pdfMetadata = JSON.stringify({ name: pdfFileName, parents: [unpaidFolderId], mimeType: 'application/pdf' });
          const pdfBefore = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${pdfMetadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`);
          const pdfAfter = enc.encode(`\r\n--${boundary}--`);
          const pdfUploadBody = new Uint8Array(pdfBefore.length + pdfBytes.length + pdfAfter.length);
          pdfUploadBody.set(pdfBefore); pdfUploadBody.set(pdfBytes, pdfBefore.length); pdfUploadBody.set(pdfAfter, pdfBefore.length + pdfBytes.length);
          const pdfUploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
            body: pdfUploadBody
          });
          const uploadedPdf = await pdfUploadRes.json();
          if (!pdfUploadRes.ok) throw new Error(`PDF upload failed: ${JSON.stringify(uploadedPdf.error)}`);
          const pdfFileId = uploadedPdf.id;

          await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}/permissions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          });

          const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfFileId}?fields=webViewLink`, { headers: { 'Authorization': `Bearer ${driveToken}` } });
          const fileDetails = await fileDetailsRes.json();
          const driveViewLink = fileDetails.webViewLink;

          // Send invoice email via Brevo
          const brevoApiKey = Deno.env.get('BREVO_API_KEY');
          const firstName = sb.client_name.split(' ')[0];
          const htmlEmailBody = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;"><p>Hi ${firstName},</p><p>Your invoice for media services at <strong>${propertyAddress}</strong> is ready.</p><p style="text-align: center; margin: 30px 0;"><a href="${driveViewLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">👉 View Invoice</a></p><p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107</p></body></html>`;
          await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail }, to: [{ email: sb.client_email, name: sb.client_name }], subject: 'Your Invoice from Arriv Estate Media', htmlContent: htmlEmailBody })
          });

          // Save invoice record
          const invoice = await base44.asServiceRole.entities.Invoice.create({
            invoice_number: invoiceNumber,
            invoice_type: 'pay_up_front',
            booking_id: createdBooking.id,
            client_name: sb.client_name,
            client_email: sb.client_email,
            job_address: propertyAddress,
            service_date: sb.preferred_date,
            package: sb.package_id,
            add_ons: sb.add_on_ids || [],
            amount: chargeAmount,
            payment_status: 'unpaid',
            stripe_payment_link_id: stripeData.id,
            stripe_payment_link_url: stripeData.url,
            google_drive_unpaid_url: driveViewLink,
            google_drive_file_id: pdfFileId,
            pay_at_closing: false,
            email_sent_at: new Date().toISOString()
          });

          await base44.asServiceRole.entities.Booking.update(createdBooking.id, { invoice_id: invoice.id, payment_locked: true });
        } else {
          // Future shoot: call handleBookingSubmission normally (user-initiated flows only, so just create the booking and let admin handle it)
          // Nothing extra needed — booking is created above with status 'pending'
        }

        await base44.asServiceRole.entities.ScheduledBooking.update(sb.id, {
          status: 'submitted',
          submitted_booking_id: createdBooking.id,
        });

        results.push({ id: sb.id, status: 'submitted' });
      } catch (err) {
        await base44.asServiceRole.entities.ScheduledBooking.update(sb.id, {
          status: 'failed',
          error_message: err.message || 'Unknown error',
        });
        results.push({ id: sb.id, status: 'failed', error: err.message });
      }
    }

    return Response.json({ processed: due.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});