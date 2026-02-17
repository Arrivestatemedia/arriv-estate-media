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
    
    // 1. Delete from UNPAID folder
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    
    if (invoice.google_drive_file_id) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${invoice.google_drive_file_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
    }
    
    // 2. Upload to PAID folder with PAID marking
    const paidUploadResult = await base44.asServiceRole.functions.invoke('uploadInvoiceToGoogleDrive', {
      fileName: `${invoice.job_address}.pdf`,
      invoiceContent: `PAID Invoice for ${invoice.job_address}`,
      folderType: 'paid',
      invoiceNumber: invoice.invoice_number,
      markAsPaid: true
    });
    
    // 3. Update invoice record
    await base44.asServiceRole.entities.Invoice.update(invoice.id, {
      google_drive_paid_url: paidUploadResult.data.fileUrl,
      google_drive_file_id: paidUploadResult.data.fileId
    });
    
    // 4. Send receipt to client via Gmail
    await base44.asServiceRole.functions.invoke('sendReceiptToClient', {
      invoiceId: invoice.id
    });
    
    // 5. Send SMS to client via Twilio
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
    
    // Get client phone from booking
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
    
    // 6. Send SMS to Bradley
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
    
    // 7. Unlock approval buttons if pay-up-front
    if (!invoice.pay_at_closing && invoice.booking_id) {
      await base44.asServiceRole.entities.Booking.update(invoice.booking_id, {
        status: 'confirmed',
        payment_locked: false
      });
    }
    
    // 8. Log to HubSpot
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
    
    return Response.json({ success: true });
    
  } catch (error) {
    console.error('Error processing payment:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});