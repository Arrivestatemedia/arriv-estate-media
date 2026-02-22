import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    
    const to = params.get('To');
    const from = params.get('From');
    
    console.log('TwiML Handler received:', { to, from, bodyKeys: Array.from(params.keys()) }); // Token identity like "sales_rep_xxx"
    
    if (!to) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>No phone number provided.</Say>
</Response>`;
      return new Response(twiml, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' }
      });
    }
    
    let callerId = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER');

    if (!callerId) {
      console.error('TWILIO_CALLING_PHONE_NUMBER not set in secrets');
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Configuration error. Please contact support.</Say>
</Response>`;
      return new Response(twiml, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' }
      });
    }
    
    // Extract salesMemberId from token identity (format: client:sales_rep_xxx or sales_rep_xxx)
    const fromIdentity = from?.includes(':') ? from.split(':')[1] : from;
    if (fromIdentity && fromIdentity.startsWith('sales_rep_')) {
      const salesMemberId = fromIdentity.replace('sales_rep_', '').replace(/_/g, '-');
      
      try {
        const base44 = createClientFromRequest(req);
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
        const member = members[0];
        if (member && member.twilio_phone_number) {
          callerId = member.twilio_phone_number;
        }
      } catch (err) {
        console.error('Failed to look up sales member:', err);
        // Fall through to default callerId
      }
    }

    // Determine if this is an incoming call to the rep or an outbound call
    let twiml;
    const isOutboundFromDevice = fromIdentity && fromIdentity.startsWith('sales_rep_');
    
    console.log('Call routing - isOutboundFromDevice:', isOutboundFromDevice, 'to:', to, 'from:', from, 'fromIdentity:', fromIdentity);
    
    if (isOutboundFromDevice) {
      // Incoming call from external number - route to ALL active sales reps
      let targetDevices = [];
      
      try {
        const base44 = createClientFromRequest(req);
        // Get ALL active sales reps
        const allMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });
        console.log('Found active sales members:', allMembers.length);
        
        for (const member of allMembers) {
          const deviceId = `sales_rep_${member.id.replace(/-/g, '_')}`;
          targetDevices.push(deviceId);
          console.log('Adding device to dial:', deviceId);
        }
      } catch (err) {
        console.error('Failed to look up sales members for incoming call:', err);
      }
      
      if (targetDevices.length > 0) {
        // Dial all available sales reps simultaneously
        const dialClients = targetDevices.map(device => `<Client>${device}</Client>`).join('\n  ');
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${from}" timeout="30">
    ${dialClients}
  </Dial>
</Response>`;
        console.log('Routing incoming call to devices:', targetDevices);
      } else {
        console.warn('No active sales members found to route call');
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>No one is available to take your call. Please try again later.</Say>
</Response>`;
      }
    } else if (from && from.startsWith('sales_rep_')) {
      // Call from device to external number
      console.log('Outbound call from device to:', to);
      // Format number as E.164 if not already
      let formattedNumber = to.trim();
      if (!formattedNumber.startsWith('+1')) {
        formattedNumber = '+1' + formattedNumber.replace(/\D/g, '');
      }
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" timeout="30">
    <Number>${formattedNumber}</Number>
  </Dial>
</Response>`;
    } else {
      // Default outbound (shouldn't normally happen)
      console.log('Default outbound call to:', to);
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}">
    <Number>${to}</Number>
  </Dial>
</Response>`;
    }

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' }
    });
  } catch (error) {
    console.error('Error in twilioVoiceHandler:', error);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Please try again.</Say>
</Response>`;
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' }
    });
  }
});