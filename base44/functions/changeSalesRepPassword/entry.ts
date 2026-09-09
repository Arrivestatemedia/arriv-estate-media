import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { verifyPassword, isLegacyHash, hashPassword } from '../../shared/passwordKdf.ts';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '../../shared/rateLimiter.ts';
import { auditLog } from '../../shared/securityAudit.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const { salesMemberId, currentPassword, newPassword } = await req.json();

    if (!salesMemberId || !currentPassword || !newPassword) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Rate limiting
    const rlKey = getRateLimitKey(req, salesMemberId);
    const rl = checkRateLimit(rlKey, 'password_change', RATE_LIMITS.password_change);
    if (!rl.allowed) {
      await auditLog(base44, req, {
        event_type: 'rate_limit_triggered',
        actor_type: 'sales_team_member',
        actor_id: salesMemberId,
        action: 'changeSalesRepPassword',
        result: 'denied',
        reason: 'rate_limit_exceeded',
      });
      return Response.json(
        { error: 'Too many password change attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    // Look up the member
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
    if (!members || members.length === 0) {
      await auditLog(base44, req, {
        event_type: 'password_change',
        actor_type: 'anonymous',
        action: 'changeSalesRepPassword',
        result: 'failure',
        reason: 'member_not_found',
        target_type: 'SalesTeamMember',
        target_id: salesMemberId,
      });
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    const member = members[0];

    // Verify current password using KDF
    const currentValid = await verifyPassword(currentPassword, member.password_hash || '');
    if (!currentValid) {
      await auditLog(base44, req, {
        event_type: 'password_change',
        actor_type: 'sales_team_member',
        actor_id: salesMemberId,
        actor_email: member.email,
        action: 'changeSalesRepPassword',
        result: 'failure',
        reason: 'invalid_current_password',
        target_type: 'SalesTeamMember',
        target_id: salesMemberId,
      });
      return Response.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Hash new password using PBKDF2 KDF
    const newHash = await hashPassword(newPassword);

    await base44.asServiceRole.entities.SalesTeamMember.update(salesMemberId, {
      password_hash: newHash,
      force_password_change: false
    });

    await auditLog(base44, req, {
      event_type: 'password_change',
      actor_type: 'sales_team_member',
      actor_id: salesMemberId,
      actor_email: member.email,
      action: 'changeSalesRepPassword',
      result: 'success',
      target_type: 'SalesTeamMember',
      target_id: salesMemberId,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Password change error:', error.message);
    await auditLog(base44, req, {
      event_type: 'password_change',
      actor_type: 'anonymous',
      action: 'changeSalesRepPassword',
      result: 'error',
      reason: 'server_error',
    });
    return Response.json({ error: 'Password change failed' }, { status: 500 });
  }
});