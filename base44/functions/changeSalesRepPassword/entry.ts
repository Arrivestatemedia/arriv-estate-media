import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { salesMemberId, currentPassword, newPassword } = await req.json();

    if (!salesMemberId || !currentPassword || !newPassword) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Look up the member
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
    if (!members || members.length === 0) {
      return Response.json({ error: 'Member not found' }, { status: 404 });
    }
    const member = members[0];

    // Verify current password
    const encoder = new TextEncoder();
    const currentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(currentPassword)))).map(b => b.toString(16).padStart(2, '0')).join('');

    if (currentHash !== member.password_hash) {
      return Response.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Hash new password
    const newHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(newPassword)))).map(b => b.toString(16).padStart(2, '0')).join('');

    await base44.asServiceRole.entities.SalesTeamMember.update(salesMemberId, { password_hash: newHash, force_password_change: false });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});