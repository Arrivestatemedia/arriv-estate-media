import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { verifyPassword, isLegacyHash, hashPassword } from '../../shared/passwordKdf.ts';
import { mintCustomerSession } from '../../shared/customerSession.ts';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '../../shared/rateLimiter.ts';
import { auditLog } from '../../shared/securityAudit.ts';
import { customerEmailQuery } from '../../shared/customerEmail.ts';

export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const { email, password } = await req.json().catch(() => ({}));

    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return Response.json({ success: false, error: 'Email and password required' }, { status: 400 });
    }

    // Rate limiting
    const rlKey = getRateLimitKey(req, email);
    const rl = checkRateLimit(rlKey, 'login', RATE_LIMITS.login);
    if (!rl.allowed) {
      await auditLog(base44, req, {
        event_type: 'rate_limit_triggered',
        actor_type: 'anonymous',
        actor_email: email,
        action: 'verifySignIn',
        result: 'denied',
        reason: 'rate_limit_exceeded',
      });
      return Response.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const emailLower = email.trim().toLowerCase();

    // Case-insensitive, bounded server lookup; a database outage is not 'account missing'.
    const pending = await base44.asServiceRole.entities.PendingSignup.filter(customerEmailQuery('email', emailLower), '-created_date', 1);
    const foundPending = (Array.isArray(pending) ? pending : pending?.items || [])[0];

    if (foundPending) {
      const passwordValid = await verifyPassword(password, foundPending.password_hash || '');
      if (!passwordValid) {
        await auditLog(base44, req, {
          event_type: 'login_failure',
          actor_type: 'anonymous',
          actor_email: email,
          action: 'verifySignIn',
          result: 'failure',
          reason: 'invalid_password',
          target_type: 'PendingSignup',
          target_id: foundPending.id,
        });
        return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
      }

      // Password migration
      if (isLegacyHash(foundPending.password_hash || '')) {
        try {
          const newHash = await hashPassword(password);
          await base44.asServiceRole.entities.PendingSignup.update(foundPending.id, { password_hash: newHash });
        } catch (e) { /* non-critical */ }
      }

      await auditLog(base44, req, {
        event_type: 'login_success',
        actor_type: 'platform_user',
        actor_id: foundPending.id,
        actor_email: email,
        action: 'verifySignIn',
        result: 'success',
        target_type: 'PendingSignup',
        target_id: foundPending.id,
      });

      const session = mintCustomerSession(foundPending, 'pending');
      if (!session) return Response.json({ success: false, error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 503 });
      return Response.json({
        success: true,
        id: foundPending.id,
        email: foundPending.email,
        full_name: foundPending.full_name,
        user_type: foundPending.user_type,
        user_role: foundPending.user_role === 'admin' ? 'admin' : 'user',
        phone_number: foundPending.phone_number || '',
        orientationCompleted: foundPending.orientationCompleted || false,
        onboardingFeePaid: foundPending.onboardingFeePaid || false,
        ...session
      });
    }

    const users = await base44.asServiceRole.entities.User.filter(customerEmailQuery('email', emailLower));
    const foundUser = (Array.isArray(users) ? users : users?.items || [])[0];

    if (foundUser) {
      const passwordValid = await verifyPassword(password, foundUser.password_hash || '');
      if (!passwordValid) {
        await auditLog(base44, req, {
          event_type: 'login_failure',
          actor_type: 'platform_user',
          actor_email: email,
          action: 'verifySignIn',
          result: 'failure',
          reason: 'invalid_password',
          target_type: 'User',
          target_id: foundUser.id,
        });
        return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });
      }

      // Password migration
      if (isLegacyHash(foundUser.password_hash || '')) {
        try {
          const newHash = await hashPassword(password);
          await base44.asServiceRole.entities.User.update(foundUser.id, { password_hash: newHash });
        } catch (e) { /* non-critical */ }
      }

      await auditLog(base44, req, {
        event_type: 'login_success',
        actor_type: 'platform_user',
        actor_id: foundUser.id,
        actor_email: email,
        action: 'verifySignIn',
        result: 'success',
        target_type: 'User',
        target_id: foundUser.id,
      });

      const session = mintCustomerSession({ ...foundUser, user_role: 'user' }, 'user');
      if (!session) return Response.json({ success: false, error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 503 });
      return Response.json({
        success: true,
        id: foundUser.id,
        email: foundUser.email,
        full_name: foundUser.full_name,
        user_type: foundUser.user_type === 'media_partner' ? 'media_partner' : 'client',
        user_role: foundUser.user_role === 'admin' ? 'admin' : 'user',
        phone_number: foundUser.phone_number || '',
        orientationCompleted: foundUser.orientationCompleted || false,
        onboardingFeePaid: foundUser.onboardingFeePaid || false,
        ...session,
      });
    }

    // Normalized error — do not reveal whether email exists
    await auditLog(base44, req, {
      event_type: 'login_failure',
      actor_type: 'anonymous',
      actor_email: email,
      action: 'verifySignIn',
      result: 'failure',
      reason: 'user_not_found',
    });
    return Response.json({ success: false, error: 'Email or password incorrect' }, { status: 401 });

  } catch (error) {
    console.error('SignIn error:', error.message);
    await auditLog(base44, req, {
      event_type: 'login_failure',
      actor_type: 'anonymous',
      action: 'verifySignIn',
      result: 'error',
      reason: 'server_error',
    });
    return Response.json({ success: false, error: 'Sign in failed' }, { status: 500 });
  }
}