import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { verifyAdmin } from '../../shared/adminAuth.ts';

/**
 * Admin-only access to pending customer/contractor accounts.
 *
 * Replaces the previous direct browser reads of PendingSignup on the admin user
 * and background-check screens. Authorization is the existing admin check (platform
 * admin role, or a SalesTeamMember with the admin role) — no new role model.
 *
 * Credential material is stripped: password_hash and deletion_token never leave
 * the server. Operational fields the admin screens already display (payout method,
 * background-check state) are preserved so existing functionality is unchanged.
 *
 * NOTE: this does not change row-level security, so the entity itself remains
 * directly readable by an anonymous caller. Closing that needs a separate,
 * explicitly approved access-control change.
 */
function forBrowser(row: any) {
  if (!row) return null;
  const { password_hash, deletion_token, ...safe } = row;
  return safe;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.json().catch(() => ({}));

    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth.authorized) {
      return Response.json({ ok: false, error: auth.error }, { status: 403 });
    }

    const action = body.action || 'list';

    if (action === 'list') {
      const query: Record<string, any> = {};
      if (body.user_type) query.user_type = body.user_type;

      const rows = await base44.asServiceRole.entities.PendingSignup.filter(query, '-created_date', 500);
      const list = Array.isArray(rows) ? rows : (rows?.items || []);
      return Response.json({ ok: true, pending_signups: list.map(forBrowser) });
    }

    if (action === 'delete') {
      const ids: string[] = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      if (ids.length === 0) {
        return Response.json({ ok: false, error: 'ids are required' }, { status: 400 });
      }
      let deleted = 0;
      for (const id of ids) {
        try {
          await base44.asServiceRole.entities.PendingSignup.delete(id);
          deleted += 1;
        } catch (e) {
          console.error('pending signup delete failed:', id, e?.message);
        }
      }
      return Response.json({ ok: true, deleted });
    }

    return Response.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('adminManagePendingSignups error:', error?.message);
    return Response.json({ ok: false, error: 'Request failed' }, { status: 500 });
  }
});