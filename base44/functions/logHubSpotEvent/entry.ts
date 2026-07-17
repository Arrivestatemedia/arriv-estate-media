import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contactEmail, eventType, invoiceId, jobAddress, details } = await req.json();
    
    // Store event locally in the HubSpotEvent entity (audit trail — no HubSpot API calls)
    const hubspotEvent = await base44.asServiceRole.entities.HubSpotEvent.create({
      contact_email: contactEmail,
      event_type: eventType,
      invoice_id: invoiceId,
      job_address: jobAddress,
      event_details: details || {},
      synced_to_hubspot: true,
      hubspot_timeline_id: null
    });
    
    return Response.json({ success: true, eventId: hubspotEvent.id });
    
  } catch (error) {
    console.error('Error logging event:', error);
    return Response.json({ success: false, error: error.message });
  }
});