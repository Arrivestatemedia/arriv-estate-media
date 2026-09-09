import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { auditLog } from '../../shared/securityAudit.ts';

// DEBUG ENDPOINT — LOCKED DOWN TO ADMIN ONLY
// Round 2 remediation: This endpoint computes password hashes and could be
// used for offline brute-force attacks if exposed.
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
        action: 'debugHash',
        result: 'denied',
        reason: 'admin_required',
      });
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { password } = await req.json();
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return Response.json({ hash: hashHex });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});