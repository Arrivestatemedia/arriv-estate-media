import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Converts a Twilio client identity like "sales_rep_abc123de_f456_..." back to a member record
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { identity } = await req.json();

    if (!identity) {
      return Response.json({ error: 'identity required' }, { status: 400 });
    }

    // Identity format: sales_rep_<uuid with hyphens replaced by underscores>
    // We can't perfectly reverse underscores→hyphens for UUIDs, so we list all members and match
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });

    const match = members.find(m => {
      const memberIdentity = `sales_rep_${m.id.replace(/-/g, '_')}`;
      return memberIdentity === identity;
    });

    if (!match) {
      return Response.json({ error: 'Member not found' }, { status: 404 });
    }

    return Response.json({
      full_name: match.full_name,
      extension: match.extension || null
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});