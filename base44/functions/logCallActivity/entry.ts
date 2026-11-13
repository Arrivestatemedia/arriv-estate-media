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
      direction,
      callSid
    } = await req.json();

    if (!salesMemberId) {
      return Response.json({ error: 'salesMemberId required' }, { status: 400 });
    }

    const durationMinutes = Math.ceil((durationSeconds || 0) / 60);

    // A dialer name that is really just the number is never treated as a name.
    const savedName = /[A-Za-z]/.test(String(contactName || '')) ? String(contactName).trim() : '';
    const savedEmail = String(contactEmail || '').trim();

    // Look up the sales member to get their email
    let salesMemberEmail = '';
    if (salesMemberId) {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      if (members[0]) salesMemberEmail = members[0].email;
    }

    // Create ActivityLog record (this is the system of record for activities)
    const activity = await base44.asServiceRole.entities.ActivityLog.create({
      activity_type: 'call',
      contact_name: savedName,
      contact_email: savedEmail,
      company_name: companyName || '',
      activity_date: new Date().toISOString(),
      notes: notes || `Call to ${toNumber || 'unknown'}${callSid ? ` (SID: ${callSid})` : ''}`,
      duration_minutes: durationMinutes,
      direction: direction === 'incoming' ? 'incoming' : 'outgoing',
      sales_member_id: salesMemberId || '',
      sales_member_email: salesMemberEmail
    });

    // Logging a call NEVER creates a contact or prospect. Only the call log is
    // written. An existing contact is merely tidied up; a new one is created
    // only when the rep deliberately saves it.
    if (savedEmail || toNumber) {
      let contact = null;

      // Find by email first
      if (savedEmail) {
        const existing = await base44.asServiceRole.entities.Contact.filter({ email: savedEmail });
        if (existing && existing.length > 0) contact = existing[0];
      }

      // Then by phone
      if (!contact && toNumber) {
        const byPhone = await base44.asServiceRole.entities.Contact.filter({ phone: toNumber });
        if (byPhone && byPhone.length > 0) contact = byPhone[0];
      }

      if (contact) {
        // Update phone/company if we have new info
        const updates = {};
        if (toNumber && !contact.phone) updates.phone = toNumber;
        if (companyName && !contact.company) updates.company = companyName;
        // Attribute an unattributed contact to the rep who called them, so it
        // shows up in that rep's contact list.
        if (salesMemberId && !contact.sales_member_id && (!contact.owner_id || contact.owner_id === salesMemberId)) {
          updates.sales_member_id = salesMemberId;
        }
        if (Object.keys(updates).length > 0) {
          await base44.asServiceRole.entities.Contact.update(contact.id, updates);
        }
      }
    }

    return Response.json({ success: true, activityId: activity.id });

  } catch (error) {
    console.error('Log call activity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});