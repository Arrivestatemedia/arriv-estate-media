import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token } = await req.json();
    
    // Find invoice by tracked link token
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ tracked_link_token: token });
    const invoice = invoices[0];
    
    if (!invoice) {
      return Response.json({ 
        error: 'Invoice not found',
        redirectUrl: 'https://arrivestatemedia.com'
      }, { status: 404 });
    }
    
    // Update invoice with first click time if not already set
    if (!invoice.link_clicked_at) {
      await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        link_clicked_at: new Date().toISOString()
      });
      
      // Log to HubSpot
      await base44.asServiceRole.functions.invoke('logHubSpotEvent', {
        contactEmail: invoice.client_email,
        eventType: 'link_clicked',
        invoiceId: invoice.id,
        jobAddress: invoice.job_address,
        details: {
          clickedAt: new Date().toISOString()
        }
      });
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