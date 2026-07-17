import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

const normalizeEmail = (e) => (e || '').toLowerCase().trim();
const digitsOnly = (p) => (p || '').replace(/\D/g, '').slice(-10);
const splitName = (name) => {
  const parts = (name || '').trim().split(/\s+/);
  return { firstname: parts[0] || '', lastname: parts.slice(1).join(' ') || '' };
};
const isNotFound = (v) => !v || String(v).toLowerCase().includes('not found');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { salesMemberId, realtor } = await req.json();
    if (!salesMemberId) return Response.json({ error: 'salesMemberId required' }, { status: 400 });
    if (!realtor || !realtor.name) return Response.json({ error: 'realtor.name required' }, { status: 400 });

    // Verify sales member
    let salesMember = null;
    try {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      if (members && members.length > 0) salesMember = members[0];
    } catch (e) {
      console.warn('Sales member lookup error:', e?.message);
    }
    if (!salesMember) {
      return Response.json({ error: 'Sales member not found' }, { status: 404 });
    }
    const repName = salesMember.full_name || salesMember.email || '';

    const email = realtor.email ? normalizeEmail(realtor.email) : '';
    const phoneDigits = digitsOnly(realtor.phone);
    const { firstname, lastname } = splitName(realtor.name);

    // Find existing contact by email (normalized), then by phone
    const allContacts = await base44.asServiceRole.entities.Contact.list('-created_date', 5000);
    let contact = null;
    if (email && email !== 'notfound') {
      contact = allContacts.find(c => normalizeEmail(c.email) === email) || null;
    }
    if (!contact && phoneDigits.length >= 10) {
      contact = allContacts.find(c => digitsOnly(c.phone) === phoneDigits) || null;
    }

    if (contact) {
      // Already owned by another rep → cannot take
      if (contact.owner_id && contact.owner_id !== salesMemberId) {
        let otherMembers = [];
        try { otherMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: contact.owner_id }); } catch (e) { console.warn('Owner lookup error:', e?.message); }
        const ownerName = otherMembers[0]?.full_name || otherMembers[0]?.email || 'another rep';
        return Response.json({
          error: `Contact already owned by ${ownerName}`,
          contact,
          owner_name: ownerName,
          owned_by_me: false
        }, { status: 409 });
      }
      // Unowned → take ownership; or already mine → fill in missing fields
      const updates = { owner_id: salesMemberId };
      if (!contact.firstname && firstname) updates.firstname = firstname;
      if (!contact.lastname && lastname) updates.lastname = lastname;
      if (!contact.email && !isNotFound(realtor.email)) updates.email = realtor.email.trim();
      if (!contact.phone && !isNotFound(realtor.phone)) updates.phone = realtor.phone;
      if (!contact.company && realtor.brokerage) updates.company = realtor.brokerage;
      if (!contact.job_title) updates.job_title = 'Real Estate Agent';
      if (!contact.lead_status) updates.lead_status = 'NEW';
      if (!contact.lifecycle_stage) updates.lifecycle_stage = 'lead';
      const wasAlreadyMine = contact.owner_id === salesMemberId;
      const updated = await base44.asServiceRole.entities.Contact.update(contact.id, updates);
      return Response.json({
        success: true,
        message: wasAlreadyMine ? 'Already owned by you' : 'Ownership claimed',
        contact: updated,
        owner_name: repName,
        owned_by_me: true
      });
    }

    // Create new contact owned by this rep
    const created = await base44.asServiceRole.entities.Contact.create({
      firstname,
      lastname,
      email: !isNotFound(realtor.email) ? realtor.email.trim() : '',
      phone: !isNotFound(realtor.phone) ? realtor.phone : '',
      company: realtor.brokerage || '',
      job_title: 'Real Estate Agent',
      lead_status: 'NEW',
      lifecycle_stage: 'lead',
      owner_id: salesMemberId
    });

    return Response.json({
      success: true,
      message: 'Contact added to your database',
      contact: created,
      owner_name: repName,
      owned_by_me: true
    });
  } catch (error) {
    console.error('claimProspectingContact error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});