import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contactEmail, eventType, invoiceId, jobAddress, details } = await req.json();
    
    // Create HubSpot event record in Base44
    const hubspotEvent = await base44.asServiceRole.entities.HubSpotEvent.create({
      contact_email: contactEmail,
      event_type: eventType,
      invoice_id: invoiceId,
      job_address: jobAddress,
      event_details: details || {},
      synced_to_hubspot: false
    });
    
    // Get HubSpot access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('hubspot');
    
    // Create timeline event in HubSpot
    const eventTitle = {
      'email_sent': 'Invoice Email Sent',
      'link_clicked': 'Invoice Link Clicked',
      'payment_confirmed': 'Payment Received',
      'reminder_sent': 'Payment Reminder Sent'
    }[eventType] || 'Event';
    
    const eventDescription = {
      'email_sent': `Invoice email sent for ${jobAddress}. Link: ${details?.trackedLink || 'N/A'}`,
      'link_clicked': `Client clicked invoice link for ${jobAddress}`,
      'payment_confirmed': `Payment of $${details?.amount || 'N/A'} received for ${jobAddress}`,
      'reminder_sent': `Reminder ${details?.reminderNumber || ''} sent for ${jobAddress}`
    }[eventType] || 'Event occurred';
    
    // Find or create contact in HubSpot
    const contactSearchResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator: 'EQ',
              value: contactEmail
            }]
          }]
        })
      }
    );
    
    const contactData = await contactSearchResponse.json();
    let contactId;
    
    if (contactData.results && contactData.results.length > 0) {
      contactId = contactData.results[0].id;
    } else {
      // Create contact if doesn't exist
      const createContactResponse = await fetch(
        'https://api.hubapi.com/crm/v3/objects/contacts',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            properties: {
              email: contactEmail
            }
          })
        }
      );
      const newContact = await createContactResponse.json();
      contactId = newContact.id;
    }
    
    // Create note/engagement for the contact
    const noteResponse = await fetch(
      'https://api.hubapi.com/crm/v3/objects/notes',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            hs_note_body: `${eventTitle}: ${eventDescription}`,
            hs_timestamp: new Date().toISOString()
          },
          associations: [{
            to: { id: contactId },
            types: [{
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 202
            }]
          }]
        })
      }
    );
    
    if (noteResponse.ok) {
      const noteData = await noteResponse.json();
      await base44.asServiceRole.entities.HubSpotEvent.update(hubspotEvent.id, {
        synced_to_hubspot: true,
        hubspot_timeline_id: noteData.id
      });
    } else {
      const errorData = await noteResponse.json();
      await base44.asServiceRole.entities.HubSpotEvent.update(hubspotEvent.id, {
        sync_error: errorData.message || 'Unknown error'
      });
    }
    
    return Response.json({ success: true, eventId: hubspotEvent.id });
    
  } catch (error) {
    console.error('Error logging to HubSpot:', error);
    // Don't fail the main operation if HubSpot logging fails
    return Response.json({ success: false, error: error.message });
  }
});