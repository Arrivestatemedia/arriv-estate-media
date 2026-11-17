/**
 * syncChatStatusWithCalendar — chat availability from the person's own calendar.
 *
 * Reads the employee's connected Google Workspace or Microsoft 365 calendar,
 * never the shared company calendar connection.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { syncChatStatusForMember } from '../../shared/empComm/chatStatus.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { salesMemberId } = await req.json().catch(() => ({}));

    if (!salesMemberId) {
      return Response.json({ error: 'salesMemberId required' }, { status: 400 });
    }

    const result = await syncChatStatusForMember(base44, salesMemberId);
    return Response.json(result);
  } catch (error: any) {
    console.error('Calendar sync error:', error?.message);
    // A failed read never rewrites someone's status.
    return Response.json({ error: error?.message || 'Calendar sync failed' }, { status: 500 });
  }
});