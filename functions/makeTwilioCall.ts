import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    const { toNumber, salesMemberId, contactName, contactEmail, companyName } = await req.json();

    if (!toNumber || !salesMemberId) {
      return Response.json({ error: 'toNumber and salesMemberId required' }, { status: 400 });
    }

    // Fetch the sales team member
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
    const member = members[0];
    if (!member) {
      return Response.json({ error: 'Sales member not found' }, { status: 404 });
    }

    const fromNumber = member.twilio_phone_number || Deno.env.get('TWILIO_PHONE_NUMBER');
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'https://example.com';

    // Make the outbound call via Twilio REST API
    const twimlUrl = `${appDomain}/api/twilio-voice-response`;

    const formData = new URLSearchParams();
    formData.append('To', toNumber);
    formData.append('From', fromNumber);
    formData.append('Url', `https://handler.twilio.com/twiml/EH9b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b`);
    formData.append('StatusCallback', `${appDomain}/api/call-status`);

    // Use Twilio REST API directly
    const callRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      }
    );

    const callData = await callRes.json();

    if (!callRes.ok) {
      throw new Error(callData.message || 'Failed to initiate call');
    }

    // Log activity immediately
    const activity = await base44.asServiceRole.entities.ActivityLog.create({
      activity_type: 'call',
      contact_name: contactName || '',
      contact_email: contactEmail || '',
      company_name: companyName || '',
      activity_date: new Date().toISOString(),
      notes: `Outbound call to ${toNumber} via Twilio`,
      duration_minutes: 0,
      hubspot_synced: false
    });

    return Response.json({
      success: true,
      callSid: callData.sid,
      activityId: activity.id,
      status: callData.status
    });

  } catch (error) {
    console.error('Make Twilio call error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});