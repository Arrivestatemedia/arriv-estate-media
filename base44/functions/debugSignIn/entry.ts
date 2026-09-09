import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { auditLog } from '../../shared/securityAudit.ts';

// DEBUG ENDPOINT — LOCKED DOWN TO ADMIN ONLY
// Round 2 remediation: This endpoint exposes service token existence and
// raw API responses. It must never be accessible to non-admin users.
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
        action: 'debugSignIn',
        result: 'denied',
        reason: 'admin_required',
      });
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { email, password } = await req.json();
    const appId = Deno.env.get('BASE44_APP_ID');
    const serviceToken = Deno.env.get('BASE44_SERVICE_TOKEN');

    const apiUrl = `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup?email=${encodeURIComponent(email)}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${serviceToken}`,
        'Content-Type': 'application/json'
      }
    });

    const body = await response.json();
    return Response.json({ status: response.status, body });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});