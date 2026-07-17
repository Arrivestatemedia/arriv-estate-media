import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contactId, properties, salesMemberId, createIfNotFound } = await req.json();

    if (!properties) {
      return Response.json({ error: 'properties required' }, { status: 400 });
    }

    // Map HubSpot-style property keys to local Contact entity fields
    const localData = {};
    if (properties.firstname !== undefined) localData.firstname = properties.firstname;
    if (properties.lastname !== undefined) localData.lastname = properties.lastname;
    if (properties.email !== undefined) localData.email = properties.email;
    if (properties.phone !== undefined) localData.phone = properties.phone;
    if (properties.company !== undefined) localData.company = properties.company;
    if (properties.jobtitle !== undefined) localData.job_title = properties.jobtitle;
    if (properties.hs_lead_status !== undefined) localData.lead_status = properties.hs_lead_status;
    if (properties.lifecyclestage !== undefined) localData.lifecycle_stage = properties.lifecyclestage;
    if (salesMemberId) localData.owner_id = salesMemberId;

    let result;

    if (!contactId || createIfNotFound) {
      // Check if a contact with this email already exists before creating
      if (localData.email) {
        const existing = await base44.asServiceRole.entities.Contact.filter({ email: localData.email });
        if (existing && existing.length > 0) {
          // Update the existing contact instead of creating a duplicate
          result = await base44.asServiceRole.entities.Contact.update(existing[0].id, localData);
          return Response.json({ success: true, contact: { id: result.id, ...result } });
        }
      }
      result = await base44.asServiceRole.entities.Contact.create(localData);
    } else {
      result = await base44.asServiceRole.entities.Contact.update(contactId, localData);
    }

    return Response.json({ success: true, contact: { id: result.id, ...result } });
  } catch (error) {
    console.error('Update/Create contact error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});