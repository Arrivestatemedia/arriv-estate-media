import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceId } = await req.json();

    const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];

    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Folder IDs
    const unpaidFolderId = '1PMtihUlPa_LRcxYdi4ZDNeWWF2zfdv7J';     // UNPAID - delete from here
    const paidInvoicesFolderId = '1bYUAfs8BwNrar1sCsnISme1Ov7a0y2vn'; // PAID INVOICES - move invoice here
    const receiptsFolderId = '1Jwc1L00KV-lseq1kGEo8jcN5sTJ9LoOt';    // PAID RECEIPTS - upload receipt here

    // ── 1. GENERATE RECEIPT PDF (same style as invoice) ─────────────────────
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
    } catch (e) {
      console.warn('Logo fetch failed:', e.message);
    }

    const { jsPDF } = await import('npm:jspdf@2.5.1');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 60;

    // Cream background
    doc.setFillColor(255, 251, 245);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Logo
    const logoH = 175;
    let curY = 0;
    if (logoBase64) {
      const imgData = `data:image/png;base64,${logoBase64}`;
      const imgProps = doc.getImageProperties(imgData);
      const logoW = (imgProps.width / imgProps.height) * logoH;
      doc.addImage(imgData, 'PNG', (pageWidth - logoW) / 2, curY, logoW, logoH);
      curY += logoH - 55;
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

    // Gold divider
    doc.setDrawColor(184, 149, 106);
    doc.setLineWidth(1);
    doc.line(margin, curY, pageWidth - margin, curY);
    curY += 50;

    // RECEIPT title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(26, 26, 26);
    doc.text('RECEIPT', margin, curY);
    curY += 18;

    // Receipt # and Date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Receipt #: ${invoice.invoice_number}`, margin, curY);
    curY += 14;
    const paidDate = invoice.paid_at ? new Date(invoice.paid_at) : new Date();
    doc.text(`Date: ${paidDate.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' })}`, margin, curY);
    curY += 26;

    // BILLED TO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('BILLED TO:', margin, curY);
    curY += 15;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(invoice.client_name, margin, curY);
    curY += 17;

    doc.setTextColor(184, 149, 106);
    doc.text('Listing Address:', margin, curY);
    curY += 15;

    doc.setTextColor(80, 80, 80);
    doc.text(invoice.job_address, margin, curY);
    curY += 15;
    doc.text(`Service Date: ${invoice.service_date}`, margin, curY);

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
    const addonPrices = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
    const addonDescriptions = { drone: 'Drone Photography', '3d_tour': '3D Virtual Tour', twilight: 'Twilight Photography', rush_delivery: 'Rush Delivery', vertical_reel: 'Vertical Reel', ai_staging: 'AI Staging' };
    const pkgNames = { mls_walkthrough: 'MLS Walkthrough', photo_essentials: 'Photo Essentials Package', photo_cinematic: 'Photo + Cinematic Walkthrough', premium_bundle: 'Premium Bundle Package' };
    const packagePrices = { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 };
    const basePkgAmount = packagePrices[invoice.package] || 0;
    const addOns = invoice.add_ons || [];

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    let y = curY;
    doc.text(pkgNames[invoice.package] || invoice.package, margin, y);
    doc.text(`$${basePkgAmount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
    y += 18;

    for (const addon of addOns) {
      const price = addonPrices[addon] || 0;
      doc.text(addonDescriptions[addon] || addon, margin, y);
      doc.text(`$${price.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
      y += 18;
    }

    // Total paid
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 26);
    doc.text('TOTAL PAID:', margin, y);
    doc.setTextColor(184, 149, 106);
    doc.text(`$${parseFloat(invoice.amount).toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
    y += 30;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // Thank you message
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('Thank you for choosing Arriv Estate Media.', margin, y);

    // Footer
    doc.setFillColor(26, 26, 26);
    doc.rect(0, pageHeight - 55, pageWidth, 55, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(184, 149, 106);
    doc.text('Arriv Estate Media LLC | Professional Property Photography & Videography', pageWidth / 2, pageHeight - 28, { align: 'center' });

    const receiptBytes = new Uint8Array(doc.output('arraybuffer'));
    console.log('Receipt PDF generated, size:', receiptBytes.length);

    // ── 2. UPLOAD RECEIPT to PAID RECEIPTS folder ───────────────────────────
    const enc = new TextEncoder();
    const boundary = 'boundary_arriv_receipt';
    const receiptFileName = `Receipt_${invoice.invoice_number}_${invoice.client_name.replace(/\s+/g, '_')}.pdf`;
    const receiptMetadata = JSON.stringify({ name: receiptFileName, parents: [receiptsFolderId], mimeType: 'application/pdf' });
    const rBefore = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${receiptMetadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`);
    const rAfter = enc.encode(`\r\n--${boundary}--`);
    const rBody = new Uint8Array(rBefore.length + receiptBytes.length + rAfter.length);
    rBody.set(rBefore); rBody.set(receiptBytes, rBefore.length); rBody.set(rAfter, rBefore.length + receiptBytes.length);

    const receiptUploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body: rBody
    });
    const receiptUploadData = await receiptUploadRes.json();
    if (!receiptUploadRes.ok) throw new Error(`Receipt upload failed: ${JSON.stringify(receiptUploadData.error)}`);
    const receiptFileId = receiptUploadData.id;
    console.log('Receipt uploaded:', receiptFileId);

    // Make receipt publicly readable
    await fetch(`https://www.googleapis.com/drive/v3/files/${receiptFileId}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    const receiptDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${receiptFileId}?fields=webViewLink`, {
      headers: { 'Authorization': `Bearer ${driveToken}` }
    });
    const receiptDetails = await receiptDetailsRes.json();
    const receiptDriveLink = receiptDetails.webViewLink;
    console.log('Receipt Drive link:', receiptDriveLink);

    // ── 3. MOVE INVOICE to PAID INVOICES folder ──────────────────────────────
    if (invoice.google_drive_file_id) {
      // First get the current parents
      const fileInfoRes = await fetch(`https://www.googleapis.com/drive/v3/files/${invoice.google_drive_file_id}?fields=parents`, {
        headers: { 'Authorization': `Bearer ${driveToken}` }
      });
      const fileInfo = await fileInfoRes.json();
      const currentParents = (fileInfo.parents || [unpaidFolderId]).join(',');

      // Move: add new parent, remove old parent
      const moveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${invoice.google_drive_file_id}?addParents=${paidInvoicesFolderId}&removeParents=${currentParents}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (moveRes.ok) {
        console.log('Invoice moved to PAID INVOICES folder');
      } else {
        const moveErr = await moveRes.json();
        console.warn('Failed to move invoice:', JSON.stringify(moveErr));
      }
    }

    // ── 4. UPDATE INVOICE RECORD ─────────────────────────────────────────────
    await base44.asServiceRole.entities.Invoice.update(invoice.id, {
      google_drive_paid_url: receiptDriveLink,
    });

    // ── 5. SEND RECEIPT EMAIL via Brevo ───────────────────────────────────────
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const adminEmail = 'BradCBurke@arrivestatemedia.com';
    const firstName = invoice.client_name.split(' ')[0];

    const htmlEmailBody = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Thank you for your payment! Please find your receipt for media services at <strong>${invoice.job_address}</strong> below.</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${receiptDriveLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">👉 View Receipt</a>
  </p>
  <p>We look forward to working with you!</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body></html>`;

    if (brevoApiKey) {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
          to: [{ email: invoice.client_email, name: invoice.client_name }],
          subject: 'Your Receipt from Arriv Estate Media',
          htmlContent: htmlEmailBody
        })
      });
      if (brevoRes.ok) {
        console.log('Receipt email sent via Brevo');
      } else {
        const brevoErr = await brevoRes.json();
        console.warn('Brevo email failed:', JSON.stringify(brevoErr));
      }
    }

    // ── 6. SMS to client ─────────────────────────────────────────────────────
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (invoice.booking_id) {
      const bookings = await base44.asServiceRole.entities.Booking.filter({ id: invoice.booking_id });
      const booking = bookings[0];
      if (booking && booking.client_phone) {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: booking.client_phone,
            From: twilioPhone,
            Body: `Payment received for ${invoice.job_address}! Your receipt has been sent via email. Thank you for choosing Arriv Estate Media. - Bradley`
          })
        });
      }
    }

    // ── 7. SMS to Bradley ────────────────────────────────────────────────────
    const bradleyPhone = Deno.env.get('BRADLEY_PHONE');
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: bradleyPhone,
        From: twilioPhone,
        Body: `Invoice paid for ${invoice.job_address} by ${invoice.client_name}.`
      })
    });

    // ── 8. Unlock booking approval ───────────────────────────────────────────
    if (invoice.booking_id) {
      try {
        if (!invoice.pay_at_closing) {
          // Pay-up-front: mark confirmed
          await base44.asServiceRole.entities.Booking.update(invoice.booking_id, {
            status: 'confirmed',
            payment_locked: false
          });
        } else {
          // Pay-at-closing: unlock so admin can click Post/Accept button again
          await base44.asServiceRole.entities.Booking.update(invoice.booking_id, {
            payment_locked: false
          });
        }
      } catch (e) {
        console.warn('Could not update booking:', e.message);
      }
    }

    // ── 9. Log to HubSpot ────────────────────────────────────────────────────
    try {
      await base44.asServiceRole.functions.invoke('logHubSpotEvent', {
        contactEmail: invoice.client_email,
        eventType: 'payment_confirmed',
        invoiceId: invoice.id,
        jobAddress: invoice.job_address,
        details: {
          amount: invoice.amount,
          paidAt: invoice.paid_at,
          stripePaymentIntentId: invoice.stripe_payment_intent_id
        }
      });
    } catch (e) {
      console.warn('HubSpot log failed:', e.message);
    }

    return Response.json({ success: true, receiptDriveLink });

  } catch (error) {
    console.error('Error processing payment:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});