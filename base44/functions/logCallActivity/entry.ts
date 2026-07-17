import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const {
      salesMemberId,
      toNumber,
      contactName,
      contactEmail,
      companyName,
      durationSeconds,
      notes,
      callSid
    } = await req.json();

    if (!salesMemberId) {
      return Response.json({ error: 'salesMemberId required' }, { status: 400 });
    }

    const durationMinutes = Math.ceil((durationSeconds || 0) / 60);

    // Look up the sales member to get their email
    let salesMemberEmail = '';
    if (salesMemberId) {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      if (members[0]) salesMemberEmail = members[0].email;
    }

    // Create ActivityLog record (this is the system of record for activities)
    const activity = await base44.asServiceRole.entities.ActivityLog.create({
      activity_type: 'call',
      contact_name: contactName || '',
      contact_email: contactEmail || '',
      company_name: companyName || '',
      activity_date: new Date().toISOString(),
      notes: notes || `Call to ${toNumber || 'unknown'}${callSid ? ` (SID: ${callSid})` : ''}`,
      duration_minutes: durationMinutes,
      sales_member_id: salesMemberId || '',
      sales_member_email: salesMemberEmail
    });

    // Ensure the contact exists in the local Contact database
    if (contactEmail || contactName) {
      let contact = null;

      // Find by email first
      if (contactEmail) {
        const existing = await base44.asServiceRole.entities.Contact.filter({ email: contactEmail });
        if (existing && existing.length > 0) contact = existing[0];
      }

      if (contact) {
        // Update phone/company if we have new info
        const updates = {};
        if (toNumber && !contact.phone) updates.phone = toNumber;
        if (companyName && !contact.company) updates.company = companyName;
        if (Object.keys(updates).length > 0) {
          await base44.asServiceRole.entities.Contact.update(contact.id, updates);
        }
      } else {
        // Create a new contact from the call data
        const nameParts = (contactName || '').split(' ');
        await base44.asServiceRole.entities.Contact.create({
          firstname: nameParts[0] || '',
          lastname: nameParts.slice(1).join(' ') || '',
          email: contactEmail || '',
          phone: toNumber || '',
          company: companyName || '',
          owner_id: salesMemberId
        });
      }
    }

    return Response.json({ success: true, activityId: activity.id });

  } catch (error) {
    console.error('Log call activity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});