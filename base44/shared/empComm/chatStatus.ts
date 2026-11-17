/**
 * Chat availability from each employee's own connected calendar.
 *
 * The status is read from that person's connected Google Workspace or
 * Microsoft 365 mailbox, so a meeting only counts for the person it belongs to.
 * With no connected calendar the hand-set status is left exactly as it is.
 */

import { accountFor } from './access.ts';
import { adapterFor, requireCapability } from './registry.ts';
import { accessTokenFor } from './store.ts';

const asList = (value: any) => (Array.isArray(value) ? value : value?.items || []);

export async function syncChatStatusForMember(base44: any, memberId: string) {
  const member = await base44.asServiceRole.entities.SalesTeamMember.get(memberId).catch(() => null);
  if (!member) return { status: null, hasActiveEvent: false, reason: 'member_not_found' };

  const account = await accountFor(base44, memberId);
  if (!account || account.status !== 'connected' || account.calendar_enabled === false) {
    return { status: member.chat_status || 'available', hasActiveEvent: false, needs_connection: true };
  }

  const adapter = adapterFor(account.provider);
  if (requireCapability(adapter, 'calendar')) {
    return { status: member.chat_status || 'available', hasActiveEvent: false, unsupported: true };
  }

  const token = await accessTokenFor(base44, account);
  const now = new Date();
  const events = await adapter.listEvents(token, {
    timeMin: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    timeMax: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    limit: 25,
  });

  const mailbox = String(account.email_address || '').toLowerCase();
  const ongoing = asList(events).filter((event: any) => {
    if (String(event.status || '').toLowerCase() === 'cancelled') return false;
    // An invitation this person declined is not time spent in a meeting.
    const declined = (event.attendees || []).some(
      (attendee: any) =>
        String(attendee?.email || '').toLowerCase() === mailbox &&
        String(attendee?.response_status || '').toLowerCase() === 'declined'
    );
    if (declined) return false;
    const start = new Date(event.start_at).getTime();
    const end = new Date(event.end_at).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && start <= now.getTime() && end > now.getTime();
  });

  const status = ongoing.length > 0 ? 'in_meeting' : 'available';
  if (member.chat_status !== status) {
    await base44.asServiceRole.entities.SalesTeamMember.update(memberId, { chat_status: status });
  }
  return { status, hasActiveEvent: ongoing.length > 0, provider: account.provider };
}