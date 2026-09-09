import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { auditLog } from '../../shared/securityAudit.ts';

// DEBUG ENDPOINT — LOCKED DOWN TO ADMIN ONLY
// Round 2 remediation: This endpoint exposes stored password hashes and all
// user emails — critical credential exposure if accessible to non-admins.
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      await auditLog(base44, req, {
        event_type: 'suspicious_request',
        actor_type: 'platform_user',
        actor_id: user?.id || '',
        actor_email: user?.email || '',
        actor_role: user?.role || 'user',
        action: 'debugUserLookup',
        result: 'denied',
        reason: 'admin_required',
      });
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { email, password } = await req.json();
    const appId = Deno.env.get('BASE44_APP_ID');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_TOKEN')}`
    };

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const resp1 = await fetch(`https://api.base44.com/v1/apps/${appId}/entities/PendingSignup`, { headers });
    let allPending = resp1.ok ? await resp1.json() : [];

    const resp2 = await fetch(`https://api.base44.com/v1/apps/${appId}/entities/User`, { headers });
    let allUsers = resp2.ok ? await resp2.json() : [];

    const foundPending = allPending.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (foundPending) {
      return Response.json({
        found: true,
        location: 'PendingSignup',
        email: foundPending.email,
        storedHash: foundPending.password_hash,
        calculatedHash: hashHex,
        hashMatch: foundPending.password_hash === hashHex
      });
    }

    const foundUser = allUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (foundUser) {
      return Response.json({
        found: true,
        location: 'User',
        email: foundUser.email,
        storedHash: foundUser.password_hash,
        calculatedHash: hashHex,
        hashMatch: foundUser.password_hash === hashHex
      });
    }

    return Response.json({ found: false });
  } catch (error) {
    console.error('Debug error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});