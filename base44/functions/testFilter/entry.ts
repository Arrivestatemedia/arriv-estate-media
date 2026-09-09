import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { auditLog } from '../../shared/securityAudit.ts';

// DEBUG/TEST ENDPOINT — LOCKED DOWN TO ADMIN ONLY
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
        action: 'testFilter',
        result: 'denied',
        reason: 'admin_required',
      });
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const result = await base44.asServiceRole.entities.PendingSignup.list();
    const filtered = result.filter(r => r.email?.toLowerCase() === 'bradcburke91@gmail.com');
    return Response.json({ success: true, count: filtered.length });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});