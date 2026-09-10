import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { secrets } from "base44:runtime";
import { handleSalesBackgroundCheckFailure } from '../../shared/orientationEngine.ts';
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

    // Rate limiting — brute-force protection
    const rlKey = getRateLimitKey(req, email);
    const rl = checkRateLimit(rlKey, 'login', RATE_LIMITS.login);
    if (!rl.allowed) {
      await auditLog(base44, req, {
        event_type: 'rate_limit_triggered',
        actor_type: 'anonymous',
        actor_email: email,
        action: 'salesTeamLogin',
        result: 'denied',
        reason: 'rate_limit_exceeded',
        metadata: { remaining: String(rl.remaining) },
      });
      return Response.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    // Find sales team member by email (case-insensitive)
    let members = await base44.asServiceRole.entities.SalesTeamMember.filter({ email });
    if (!members || members.length === 0) {
      const allMembers = await base44.asServiceRole.entities.SalesTeamMember.list();
      members = (allMembers || []).filter(m => m.email && m.email.toLowerCase() === email.toLowerCase());
    }

    if (!members || members.length === 0) {
      // Normalized error — do not reveal whether email exists
      await auditLog(base44, req, {
        event_type: 'login_failure',
        actor_type: 'anonymous',
        actor_email: email,
        action: 'salesTeamLogin',
        result: 'failure',
        reason: 'member_not_found',
      });
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const member = members[0];

    // Verify password using KDF (supports legacy + new format)
    const passwordValid = await verifyPassword(password, member.password_hash || '');

    if (!passwordValid) {
      await auditLog(base44, req, {
        event_type: 'login_failure',
        actor_type: 'sales_team_member',
        actor_id: member.id,
        actor_email: email,
        action: 'salesTeamLogin',
        result: 'failure',
        reason: 'invalid_password',
      });
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // ── Password migration: if the stored hash is legacy SHA-256, re-hash with PBKDF2 ──
    if (isLegacyHash(member.password_hash || '')) {
      try {
        const newHash = await hashPassword(password);
        await base44.asServiceRole.entities.SalesTeamMember.update(member.id, { password_hash: newHash });
      } catch (e) {
        // Non-critical — login succeeds, migration retried next time
        console.error('Password migration failed:', (e as Error).message);
      }
    }

    // Background check gate (admins bypass)
    if (member.role !== 'admin') {
      let bgStatus = null;
      let bgOrientation = null;
      try {
        const orientations = await base44.asServiceRole.entities.SalesOrientation.filter({ sales_member_id: member.id });
        if (orientations && orientations.length > 0) {
          const cleared = orientations.find(o => o.background_check_status === 'clear');
          if (cleared) {
            bgStatus = 'clear';
            bgOrientation = cleared;
          } else {
            const failed = orientations.find(o => o.background_check_status === 'failed');
            if (failed) {
              bgStatus = 'failed';
              bgOrientation = failed;
            } else {
              bgStatus = orientations[0].background_check_status;
              bgOrientation = orientations[0];
            }
          }
        }
      } catch (e) { /* no orientation = legacy rep, allow */ }

      if (bgStatus === 'failed') {
        try { if (bgOrientation) await handleSalesBackgroundCheckFailure(base44, bgOrientation); } catch (e) { /* ignore */ }
        await auditLog(base44, req, {
          event_type: 'login_failure',
          actor_type: 'sales_team_member',
          actor_id: member.id,
          actor_email: email,
          action: 'salesTeamLogin',
          result: 'denied',
          reason: 'background_check_failed',
        });
        return Response.json({ error: 'Your background check did not pass. We are unable to move forward with your offer at this time. You will receive an email with more information.', background_check_failed: true }, { status: 403 });
      }
      if (bgStatus === 'pending' || bgStatus === 'not_started' || bgStatus === 'requires_review') {
        await auditLog(base44, req, {
          event_type: 'login_failure',
          actor_type: 'sales_team_member',
          actor_id: member.id,
          actor_email: email,
          action: 'salesTeamLogin',
          result: 'denied',
          reason: 'background_check_pending',
        });
        return Response.json({ error: "Your background check is still being processed. You'll be able to access the sales system once it clears. If you have questions, contact careers@arrivestatemedia.com.", background_check_pending: true }, { status: 403 });
      }
    }

    // Check if member is active
    if (member.is_active === false) {
      await auditLog(base44, req, {
        event_type: 'login_failure',
        actor_type: 'sales_team_member',
        actor_id: member.id,
        actor_email: email,
        action: 'salesTeamLogin',
        result: 'denied',
        reason: 'account_inactive',
      });
      return Response.json({ error: 'This account is inactive' }, { status: 403 });
    }

    // Link platform user to sales team member for RLS
    let platformRole: string | null = null;
    let platformAccessToken: string | null = null;
    try {
      const allUsers = await base44.asServiceRole.entities.User.list();
      const platformUser = allUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
      if (platformUser) {
        if (platformUser.data?.sales_member_id !== member.id) {
          await base44.asServiceRole.entities.User.update(platformUser.id, { sales_member_id: member.id });
        }
        if (platformUser.role === 'admin') {
          platformRole = 'admin';
        }
        // Try to obtain a platform access token so the browser SDK has a real
        // platform session — this makes RLS rules (user.data.sales_member_id,
        // user.role) evaluate correctly.
        //
        // Strategy 1: standard email/password login (works when the platform
        //   password matches the sales password).
        // Strategy 2: call the auth API with the app's service token in the
        //   Authorization header — the platform may issue a user token when a
        //   service-role credential is presented, bypassing the password check.
        try {
          const loginResult = await base44.auth.loginViaEmailPassword(email, password);
          if (loginResult?.access_token) {
            platformAccessToken = loginResult.access_token;
          }
        } catch (e) { /* platform password may differ — try strategy 2 */ }

        if (!platformAccessToken) {
          try {
            const serviceToken = secrets.get("BASE44_SERVICE_TOKEN");
            const origin = new URL(req.url).origin;
            const appId = req.headers.get("X-App-Id") || "";
            if (serviceToken && origin && appId) {
              const resp = await fetch(`${origin}/apps/${appId}/auth/login`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceToken}`,
                },
                body: JSON.stringify({ email }),
              });
              if (resp.ok) {
                const body = await resp.json();
                if (body?.access_token) {
                  platformAccessToken = body.access_token;
                }
              }
            }
          } catch (e) { /* non-critical — fall back to sales-only session */ }
        }
      }
    } catch (e) { /* non-critical */ }

    await auditLog(base44, req, {
      event_type: 'login_success',
      actor_type: 'sales_team_member',
      actor_id: member.id,
      actor_email: email,
      actor_role: platformRole || member.role || 'user',
      action: 'salesTeamLogin',
      result: 'success',
    });

    return Response.json({
      success: true,
      memberId: member.id,
      name: member.full_name,
      email: member.email,
      role: platformRole || member.role || 'user',
      forcePasswordChange: member.force_password_change === true,
      platform_access_token: platformAccessToken,
    });

  } catch (error) {
    console.error('Sales team login error:', error.message);
    await auditLog(base44, req, {
      event_type: 'login_failure',
      actor_type: 'anonymous',
      action: 'salesTeamLogin',
      result: 'error',
      reason: 'server_error',
    });
    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
});