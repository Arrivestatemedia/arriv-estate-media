import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { hashPassword } from '../../shared/passwordKdf.ts';
import { auditLog } from '../../shared/securityAudit.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      await auditLog(base44, req, {
        event_type: 'login_failure',
        actor_type: 'platform_user',
        actor_id: user?.id || '',
        actor_email: user?.email || '',
        actor_role: user?.role || 'user',
        action: 'updateSalesTeamMemberPassword',
        result: 'denied',
        reason: 'admin_required',
      });
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { memberId, newPassword } = await req.json();

    if (!memberId || !newPassword) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Hash using PBKDF2 KDF
    const passwordHash = await hashPassword(newPassword);

    await base44.asServiceRole.entities.SalesTeamMember.update(memberId, { password_hash: passwordHash });

    await auditLog(base44, req, {
      event_type: 'password_change',
      actor_type: 'platform_user',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'admin',
      action: 'updateSalesTeamMemberPassword',
      result: 'success',
      target_type: 'SalesTeamMember',
      target_id: memberId,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Admin password update error:', error.message);
    await auditLog(base44, req, {
      event_type: 'password_change',
      actor_type: 'platform_user',
      action: 'updateSalesTeamMemberPassword',
      result: 'error',
      reason: 'server_error',
    });
    return Response.json({ error: 'Password update failed' }, { status: 500 });
  }
});