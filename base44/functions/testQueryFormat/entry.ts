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
        action: 'testQueryFormat',
        result: 'denied',
        reason: 'admin_required',
      });
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const appId = Deno.env.get('BASE44_APP_ID');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_TOKEN')}`
    };

    const formats = [
      `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup?email=BradCBurke91%40gmail.com`,
      `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup?query={"email":"BradCBurke91@gmail.com"}`,
    ];

    const results = [];
    for (const url of formats) {
      const resp = await fetch(url, { headers }).catch(e => ({ error: e.message }));
      results.push({
        url: url.split('?')[1],
        status: (resp as any).status,
        ok: (resp as any).ok,
        data: (resp as any).ok ? await (resp as any).json().catch(() => 'parse error') : 'failed'
      });
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});