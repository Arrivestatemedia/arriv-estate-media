import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { query } = await req.json();
    
    if (!query || query.trim().length < 2) {
      return Response.json({ contacts: [] });
    }

    // Search the local Contact entity
    const allContacts = await base44.asServiceRole.entities.Contact.list('-created_date', 2000);
    const q = query.trim().toLowerCase();

    const contacts = allContacts.filter(c => {
      const fullName = `${c.firstname || ''} ${c.lastname || ''}`.trim().toLowerCase();
      return (
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (fullName && fullName.includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q))
      );
    })
    .slice(0, 10)
    .map(c => ({
      id: c.id,
      email: c.email || '',
      firstname: c.firstname || '',
      lastname: c.lastname || '',
      phone: c.phone || '',
      company: c.company || '',
      jobtitle: c.job_title || '',
      lead_status: c.lead_status || '',
      lifecycle_stage: c.lifecycle_stage || '',
      sales_member_id: c.sales_member_id || '',
      owner_id: c.owner_id || ''
    }));

    return Response.json({ contacts });
  } catch (error) {
    console.error('Search contacts error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});