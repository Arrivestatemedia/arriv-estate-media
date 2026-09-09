import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { verifyPassword, isLegacyHash, hashPassword } from '../../shared/passwordKdf.ts';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '../../shared/rateLimiter.ts';
import { auditLog } from '../../shared/securityAudit.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Rate limiting — stricter for admin login
    const rlKey = getRateLimitKey(req, email);
    const rl = checkRateLimit(rlKey, 'admin_login', RATE_LIMITS.admin_login);
    if (!rl.allowed) {
      await auditLog(base44, req, {
        event_type: 'rate_limit_triggered',
        actor_type: 'anonymous',
        actor_email: email,
        action: 'adminLogin',
        result: 'denied',
        reason: 'rate_limit_exceeded',
      });
      return Response.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    // Look up admin in SalesTeamMember database using service role
    const admins = await base44.asServiceRole.entities.SalesTeamMember.filter({
      email: email,
      role: 'admin'
    });

    if (!admins || admins.length === 0) {
      // Normalized error — do not reveal whether admin email exists
      await auditLog(base44, req, {
        event_type: 'login_failure',
        actor_type: 'anonymous',
        actor_email: email,
        action: 'adminLogin',
        result: 'failure',
        reason: 'admin_not_found',
      });
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const admin = admins[0];

    if (!admin.is_active) {
      await auditLog(base44, req, {
        event_type: 'login_failure',
        actor_type: 'sales_team_member',
        actor_id: admin.id,
        actor_email: email,
        actor_role: 'admin',
        action: 'adminLogin',
        result: 'denied',
        reason: 'account_inactive',
      });
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify password using KDF (supports legacy + new format)
    const passwordValid = await verifyPassword(password, admin.password_hash || '');

    if (!passwordValid) {
      await auditLog(base44, req, {
        event_type: 'login_failure',
        actor_type: 'sales_team_member',
        actor_id: admin.id,
        actor_email: email,
        actor_role: 'admin',
        action: 'adminLogin',
        result: 'failure',
        reason: 'invalid_password',
      });
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Password migration: re-hash if legacy
    if (isLegacyHash(admin.password_hash || '')) {
      try {
        const newHash = await hashPassword(password);
        await base44.asServiceRole.entities.SalesTeamMember.update(admin.id, { password_hash: newHash });
      } catch (e) {
        console.error('Admin password migration failed:', (e as Error).message);
      }
    }

    await auditLog(base44, req, {
      event_type: 'login_success',
      actor_type: 'sales_team_member',
      actor_id: admin.id,
      actor_email: email,
      actor_role: 'admin',
      action: 'adminLogin',
      result: 'success',
    });

    return Response.json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        role: 'admin'
      }
    });
  } catch (error) {
    console.error('Admin login error:', error.message);
    await auditLog(base44, req, {
      event_type: 'login_failure',
      actor_type: 'anonymous',
      action: 'adminLogin',
      result: 'error',
      reason: 'server_error',
    });
    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
});