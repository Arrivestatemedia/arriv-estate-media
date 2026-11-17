/**
 * syncAdminChatStatusWithCalendar — the admin's own chat availability.
 *
 * Uses the admin's own connected calendar, never the shared company calendar.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { syncChatStatusForMember } from '../../shared/empComm/chatStatus.ts';

const asList = (value: any) => (Array.isArray(value) ? value : value?.items || []);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const adminEmail = Deno.env.get('ADMIN_EMAIL');
    if (!adminEmail) {
      return Response.json({ error: 'ADMIN_EMAIL secret not set' }, { status: 500 });
    }

    const members = asList(
      await base44.asServiceRole.entities.SalesTeamMember.filter({ email: adminEmail }).catch(() => [])
    );
    const member = members[0];
    if (!member) {
      return Response.json({ status: null, hasActiveEvent: false, reason: 'admin_member_not_found' });
    }

    const result = await syncChatStatusForMember(base44, member.id);
    return Response.json(result);
  } catch (error: any) {
    console.error('Admin calendar sync error:', error?.message);
    return Response.json({ error: error?.message || 'Calendar sync failed' }, { status: 500 });
  }
});