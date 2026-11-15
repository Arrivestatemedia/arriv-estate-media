/**
 * empCalendar — the employee's own calendar.
 *
 * Events are created on the connected employee's calendar as the organizer, so
 * an invitation always comes from the person who arranged the meeting. Nothing
 * here can write to another employee's calendar.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { resolveActor, resolveTargetMember, accountFor, assertMailboxOwner, audit } from '../../shared/empComm/access.ts';
import { adapterFor, requireCapability } from '../../shared/empComm/registry.ts';
import { accessTokenFor } from '../../shared/empComm/store.ts';
import { tenantFor } from '../../shared/empComm/tenant.ts';

const asList = (v: any) => (Array.isArray(v) ? v : v?.items || []);

const emails = (value: any) =>
  (Array.isArray(value) ? value : [])
    .map((entry) => String(entry?.email || entry || '').trim().toLowerCase())
    .filter((entry) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry));

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');

    const actorResult = await resolveActor(base44, req, body);
    if (!actorResult.ok) return Response.json({ error: actorResult.error }, { status: actorResult.status });
    const actor = actorResult.actor;

    const target = await resolveTargetMember(base44, actor, body.memberId);
    if (!target.ok) return Response.json({ error: target.error }, { status: target.status });
    const ownerError = assertMailboxOwner(actor, target.memberId);
    if (ownerError) return Response.json({ error: ownerError }, { status: 403 });

    const account = await accountFor(base44, target.memberId, body.provider || undefined);
    if (!account || account.status !== 'connected') {
      return Response.json(
        { error: 'A connected Google Workspace or Microsoft 365 account is required for calendar access.', needs_connection: true },
        { status: 409 }
      );
    }
    if (account.calendar_enabled === false) {
      return Response.json({ error: 'Calendar access is turned off for this connection.' }, { status: 403 });
    }

    const adapter = adapterFor(account.provider);
    const unsupported = requireCapability(adapter, 'calendar');
    if (unsupported) return Response.json({ error: unsupported }, { status: 400 });
    const token = await accessTokenFor(base44, account);
    const tenant = tenantFor(target.member);

    const store = async (event: any) => {
      const existing = asList(
        await base44.asServiceRole.entities.EmployeeCalendarEvent.filter(
          { account_id: account.id, provider_event_id: event.provider_event_id },
          { limit: 1 }
        )
      )[0];
      const payload = {
        tenant_id: tenant,
        account_id: account.id,
        sales_member_id: target.memberId,
        provider: account.provider,
        provider_event_id: event.provider_event_id,
        calendar_id: 'primary',
        title: event.title || '(no title)',
        description: event.description || '',
        location: event.location || '',
        start_at: event.start_at || '',
        end_at: event.end_at || '',
        timezone: event.timezone || 'America/New_York',
        attendees: event.attendees || [],
        status: event.status || 'confirmed',
        html_link: event.html_link || '',
        organizer_email: event.organizer_email || account.email_address,
        contact_id: event.contact_id || existing?.contact_id || '',
      };
      if (existing) return await base44.asServiceRole.entities.EmployeeCalendarEvent.update(existing.id, payload);
      return await base44.asServiceRole.entities.EmployeeCalendarEvent.create(payload);
    };

    if (action === 'list') {
      const from = body.timeMin || new Date().toISOString();
      const to = body.timeMax || new Date(Date.now() + 30 * 86400000).toISOString();
      const events = await adapter.listEvents(token, { timeMin: from, timeMax: to, limit: Number(body.limit || 25) });
      const stored = [];
      for (const event of events) stored.push(await store(event));
      return Response.json({ provider: account.provider, events: stored });
    }

    if (action === 'availability') {
      const from = body.timeMin || new Date().toISOString();
      const to = body.timeMax || new Date(Date.now() + 86400000).toISOString();
      const attendees = emails(body.attendees);
      const result = await adapter.availability(token, {
        timeMin: from,
        timeMax: to,
        attendees: attendees.length ? attendees : [account.email_address],
      });
      return Response.json({ provider: account.provider, busy: result.busy || [] });
    }

    if (action === 'create') {
      if (!String(body.title || '').trim()) return Response.json({ error: 'Give the meeting a title.' }, { status: 400 });
      const startAt = new Date(body.start_at);
      const endAt = new Date(body.end_at);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        return Response.json({ error: 'Choose a valid start and end time.' }, { status: 400 });
      }
      if (endAt <= startAt) return Response.json({ error: 'The meeting must end after it starts.' }, { status: 400 });
      if (body.confirmed !== true) {
        return Response.json({ error: 'Confirm the invitation before it is sent.' }, { status: 400 });
      }

      const attendees = emails(body.attendees);
      const created = await adapter.createEvent(token, {
        title: String(body.title),
        description: String(body.description || ''),
        location: String(body.location || ''),
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        timezone: String(body.timezone || 'America/New_York'),
        attendees: attendees.map((email) => ({ email })),
      });
      const saved = await store({
        ...created,
        title: String(body.title),
        description: String(body.description || ''),
        location: String(body.location || ''),
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        timezone: String(body.timezone || 'America/New_York'),
        attendees: attendees.map((email) => ({ email })),
        status: 'confirmed',
        contact_id: String(body.contactId || ''),
        organizer_email: account.email_address,
      });
      await audit(base44, {
        action: 'event_create',
        actor_member_id: actor.memberId,
        account_id: account.id,
        provider: account.provider,
        target: String(body.title),
        result: 'success',
      });
      return Response.json({ success: true, event: saved });
    }

    if (action === 'update') {
      if (!body.eventId) return Response.json({ error: 'eventId is required' }, { status: 400 });
      await adapter.updateEvent(token, body.eventId, {
        title: body.title,
        description: body.description,
        location: body.location,
        start_at: body.start_at,
        end_at: body.end_at,
        timezone: String(body.timezone || 'America/New_York'),
        attendees: body.attendees ? emails(body.attendees).map((email) => ({ email })) : undefined,
      });
      const existing = asList(
        await base44.asServiceRole.entities.EmployeeCalendarEvent.filter(
          { account_id: account.id, provider_event_id: body.eventId },
          { limit: 1 }
        )
      )[0];
      if (existing) {
        await base44.asServiceRole.entities.EmployeeCalendarEvent.update(existing.id, {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.start_at ? { start_at: body.start_at } : {}),
          ...(body.end_at ? { end_at: body.end_at } : {}),
        });
      }
      await audit(base44, {
        action: 'event_update',
        actor_member_id: actor.memberId,
        account_id: account.id,
        provider: account.provider,
        target: body.eventId,
        result: 'success',
      });
      return Response.json({ success: true });
    }

    if (action === 'cancel') {
      if (!body.eventId) return Response.json({ error: 'eventId is required' }, { status: 400 });
      await adapter.deleteEvent(token, body.eventId);
      const existing = asList(
        await base44.asServiceRole.entities.EmployeeCalendarEvent.filter(
          { account_id: account.id, provider_event_id: body.eventId },
          { limit: 1 }
        )
      )[0];
      if (existing) {
        await base44.asServiceRole.entities.EmployeeCalendarEvent.update(existing.id, { status: 'cancelled' });
      }
      await audit(base44, {
        action: 'event_cancel',
        actor_member_id: actor.memberId,
        account_id: account.id,
        provider: account.provider,
        target: body.eventId,
        result: 'success',
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[empCalendar]', error?.message);
    return Response.json({ error: error?.message || 'The calendar request could not be completed.' }, { status: 500 });
  }
}