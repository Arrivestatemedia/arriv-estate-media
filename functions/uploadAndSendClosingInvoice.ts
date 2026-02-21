import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const formData = await req.formData();
    
    const bookingId = formData.get('bookingId');
    const invoiceFile = formData.get('invoiceFile');

    if (!bookingId || !invoiceFile) {
      return Response.json({ error: 'bookingId and invoiceFile are required' }, { status: 400 });
    }

    // Get the booking
    const bookings = await base44.asServiceRole.entities.Booking.filter({ id: bookingId });
    const booking = bookings[0];
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Get the job from booking
    const jobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    const job = jobs[0];
    if (!job) {
      return Response.json({ error: 'No job found for this booking' }, { status: 404 });
    }

    // Get Drive token
    const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Upload invoice to Google Drive (PAID RECEIPTS folder)
    const receiptsFolderId = '1d8EjqEfDg21lfBG8LyUr89g8owVUkuWI';
    const fileBuffer = await invoiceFile.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    const enc = new TextEncoder();
    const boundary = 'boundary_closing_invoice';
    const invoiceFileName = `ClosingInvoice_${booking.id}_${booking.client_name.replace(/\s+/g, '_')}.pdf`;
    const invoiceMetadata = JSON.stringify({ name: invoiceFileName, parents: [receiptsFolderId], mimeType: 'application/pdf' });
    
    const fileBefore = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${invoiceMetadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`);
    const fileAfter = enc.encode(`\r\n--${boundary}--`);
    const fileBody = new Uint8Array(fileBefore.length + fileBytes.length + fileAfter.length);
    fileBody.set(fileBefore);
    fileBody.set(fileBytes, fileBefore.length);
    fileBody.set(fileAfter, fileBefore.length + fileBytes.length);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body: fileBody
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(`File upload failed: ${JSON.stringify(uploadData.error)}`);
    const fileId = uploadData.id;

    // Make file publicly readable
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    // Get shareable link
    const fileDetailsRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
      headers: { 'Authorization': `Bearer ${driveToken}` }
    });
    const fileDetails = await fileDetailsRes.json();
    const driveLink = fileDetails.webViewLink;

    // Update ClosingDetection record
    let detection = (await base44.asServiceRole.entities.ClosingDetection.filter({ job_id: job.id }))[0];
    if (!detection) {
      detection = await base44.asServiceRole.entities.ClosingDetection.create({
        job_id: job.id,
        job_address: job.location || booking.street_address,
        monitoring_start_date: job.date,
        status: 'manual_closed',
        closing_date: closingDate,
        final_sale_price: finalSalePrice ? parseFloat(finalSalePrice) : null,
        closed_detected_at: new Date().toISOString(),
        detection_source: 'manual'
      });
    } else {
      await base44.asServiceRole.entities.ClosingDetection.update(detection.id, {
        status: 'manual_closed',
        closing_date: closingDate,
        final_sale_price: finalSalePrice ? parseFloat(finalSalePrice) : null,
        closed_detected_at: new Date().toISOString(),
        detection_source: 'manual'
      });
    }

    // Send email via Brevo
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'BradCBurke@arrivestatemedia.com';
    const firstName = booking.client_name.split(' ')[0];

    const htmlEmailBody = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Thank you for choosing Arriv Estate Media for your property at <strong>${job.location}</strong>.</p>
  <p>The closing has now been completed on <strong>${closingDate}</strong>. Please find your final closing invoice below.</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${driveLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">👉 View Final Invoice</a>
  </p>
  <p>We appreciate your business and look forward to working with you on future projects.</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body></html>`;

    if (brevoApiKey) {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
          to: [{ email: booking.client_email, name: booking.client_name }],
          subject: 'Your Final Closing Invoice from Arriv Estate Media',
          htmlContent: htmlEmailBody
        })
      });
      if (!brevoRes.ok) {
        const brevoErr = await brevoRes.json();
        console.warn('Brevo email failed:', JSON.stringify(brevoErr));
        throw new Error('Failed to send email via Brevo');
      }
    } else {
      throw new Error('BREVO_API_KEY not configured');
    }

    // Mark detection as having final invoice sent
    await base44.asServiceRole.entities.ClosingDetection.update(detection.id, {
      final_invoice_sent: true
    });

    return Response.json({ 
      success: true, 
      clientEmail: booking.client_email,
      driveLink 
    });

  } catch (error) {
    console.error('Upload and send invoice error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});