import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contactId, salesMemberId } = await req.json();

    if (!contactId) {
      return Response.json({ error: 'contactId required' }, { status: 400 });
    }

    // Delete from local Contact entity
    await base44.asServiceRole.entities.Contact.delete(contactId);

    // Log deletion as activity
    if (salesMemberId) {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      const salesMemberEmail = members[0]?.email || '';

      await base44.asServiceRole.entities.ActivityLog.create({
        activity_type: 'email',
        contact_email: '',
        activity_date: new Date().toISOString(),
        notes: `Deleted contact ${contactId}`,
        sales_member_id: salesMemberId,
        sales_member_email: salesMemberEmail
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});