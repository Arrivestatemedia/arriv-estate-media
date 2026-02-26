import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { recipientSalesRepId, recipientExtension } = await req.json();
    
    if (!recipientSalesRepId && !recipientExtension) {
      return Response.json({ error: 'Recipient ID or extension required' }, { status: 400 });
    }

    let targetPhoneNumber;

    if (recipientSalesRepId) {
      // Look up the recipient's Twilio phone number
      const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: recipientSalesRepId });
      if (!recipients?.[0]) {
        return Response.json({ error: 'Recipient not found' }, { status: 404 });
      }
      targetPhoneNumber = recipients[0].twilio_phone_number;
    } else if (recipientExtension) {
      // Look up by extension
      const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({ extension: recipientExtension });
      if (!recipients?.[0]) {
        return Response.json({ error: 'Extension not found' }, { status: 404 });
      }
      targetPhoneNumber = recipients[0].twilio_phone_number;
    }

    if (!targetPhoneNumber) {
      return Response.json({ error: 'Target phone number not found' }, { status: 404 });
    }

    // Return transfer details - the frontend will handle the actual Twilio transfer
    return Response.json({ 
      success: true,
      targetPhoneNumber,
      message: 'Transfer ready to initiate'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});