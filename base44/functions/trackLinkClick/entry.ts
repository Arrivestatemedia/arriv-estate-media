import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let token;
    try {
      const body = await req.json();
      token = body.token;
    } catch (e) {
      console.error('JSON parse error:', e.message);
      return Response.json({ 
        redirectUrl: 'https://arrivestatemedia.com'
      }, { status: 400 });
    }
    
    if (!token) {
      console.error('No token provided');
      return Response.json({ 
        redirectUrl: 'https://arrivestatemedia.com'
      }, { status: 400 });
    }
    
    // Find invoice by tracked link token
    console.log('Looking for invoice with token:', token);
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ tracked_link_token: token });
    console.log('Found invoices:', invoices.length);
    const invoice = invoices[0];
    
    if (!invoice) {
      console.error('Invoice not found for token:', token);
      return Response.json({ 
        redirectUrl: 'https://arrivestatemedia.com'
      }, { status: 404 });
    }
    
    console.log('Invoice found:', invoice.id, 'Google Drive URL:', invoice.google_drive_unpaid_url);
    
    // Update invoice with first click time if not already set
    if (!invoice.link_clicked_at) {
      await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        link_clicked_at: new Date().toISOString()
      });
      
      // Log to HubSpot, email, and SMS asynchronously (don't wait)
      base44.asServiceRole.functions.invoke('logHubSpotEvent', {
        contactEmail: invoice.client_email,
        eventType: 'link_clicked',
        invoiceId: invoice.id,
        jobAddress: invoice.job_address,
        details: {
          clickedAt: new Date().toISOString()
        }
      }).catch(err => console.error('HubSpot log failed:', err));

      sendBrevoEmail({
        to: Deno.env.get('ADMIN_EMAIL'),
        subject: `Payment Link Opened - ${invoice.job_address}`,
        htmlContent: `
          <h2>Payment Link Opened</h2>
          <p><strong>Client:</strong> ${invoice.client_name}</p>
          <p><strong>Property:</strong> ${invoice.job_address}</p>
          <p><strong>Invoice Type:</strong> ${invoice.invoice_type}</p>
          <p><strong>Amount:</strong> $${invoice.amount.toFixed(2)}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        `
      }).catch(err => console.error('Email notification failed:', err));

      const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      const adminPhone = Deno.env.get('ADMIN_PHONE');

      fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: twilioPhone,
          To: adminPhone,
          Body: `Payment link opened by ${invoice.client_name} for ${invoice.job_address} - $${invoice.amount.toFixed(2)}`
        })
      }).catch(err => console.error('SMS notification failed:', err));
    }
    
    // Return redirect URL
    return Response.json({ 
      success: true,
      redirectUrl: invoice.google_drive_unpaid_url || invoice.google_drive_paid_url
    });
    
  } catch (error) {
    console.error('Error tracking link click:', error);
    return Response.json({ 
      error: error.message,
      redirectUrl: 'https://arrivestatemedia.com'
    }, { status: 500 });
  }
});