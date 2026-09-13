import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { generateSecurePassword, hashPassword } from '../../shared/passwordKdf.ts';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '../../shared/rateLimiter.ts';
import { auditLog } from '../../shared/securityAudit.ts';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Rate limiting — prevent reset spam and account lockout abuse
    const rlKey = getRateLimitKey(req, email);
    const rl = checkRateLimit(rlKey, 'password_reset', RATE_LIMITS.password_reset);
    if (!rl.allowed) {
      await auditLog(base44, req, {
        event_type: 'rate_limit_triggered',
        actor_type: 'anonymous',
        actor_email: email,
        action: 'salesRepForgotPassword',
        result: 'denied',
        reason: 'rate_limit_exceeded',
      });
      return Response.json(
        { error: 'Too many reset requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    // Find sales rep by email (case-insensitive)
    let reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ email });
    if (!reps || reps.length === 0) {
      const allReps = await base44.asServiceRole.entities.SalesTeamMember.list();
      reps = (allReps || []).filter(r => r.email && r.email.toLowerCase() === email.toLowerCase());
    }

    // Normalized response — do NOT reveal whether email exists
    // Always return success to prevent credential enumeration
    if (!reps || reps.length === 0) {
      await auditLog(base44, req, {
        event_type: 'password_reset_request',
        actor_type: 'anonymous',
        actor_email: email,
        action: 'salesRepForgotPassword',
        result: 'failure',
        reason: 'member_not_found',
      });
      // Return success to prevent enumeration
      return Response.json({ success: true });
    }

    const rep = reps[0];

    // Generate cryptographically secure temporary password
    const newPassword = generateSecurePassword(16);

    // Hash using PBKDF2 KDF
    const newHash = await hashPassword(newPassword);

    // Update password and set force_password_change flag
    await base44.asServiceRole.entities.SalesTeamMember.update(rep.id, {
      password_hash: newHash,
      force_password_change: true
    });

    // Send email with new password
    await sendBrevoEmail({
      to: email,
      subject: 'Your Password Has Been Reset',
      textContent: `Your password has been reset.\n\nYour new temporary password is: ${newPassword}\n\nPlease log in and change your password immediately.`
    });

    await auditLog(base44, req, {
      event_type: 'password_reset_request',
      actor_type: 'anonymous',
      actor_email: email,
      action: 'salesRepForgotPassword',
      result: 'success',
      target_type: 'SalesTeamMember',
      target_id: rep.id,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Password reset error:', error.message);
    await auditLog(base44, req, {
      event_type: 'password_reset_request',
      actor_type: 'anonymous',
      action: 'salesRepForgotPassword',
      result: 'error',
      reason: 'server_error',
    });
    // Return success to prevent enumeration even on error
    return Response.json({ success: true });
  }
});