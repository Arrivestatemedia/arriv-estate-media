import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveRecordActor, salesMessageEmails, canReadMessageLogs } from '../../shared/recordAccess.ts';

/**
 * The only browser path to MessageLog.
 *
 * MessageLog stores the full body of every SMS and email plus the recipient's
 * address and phone number, so direct reads are closed.
 *
 *   admin -> any messages
 *   sales -> only the Email Hub messages they personally sent. The sending
 *            address is constrained to the rep's own verified addresses
 *            (login email or the company_email on their SalesTeamMember
 *            record) so a rep cannot read another rep's outbox by changing a
 *            request field.
 */

const MAX_LIMIT = 300;

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const actor = await resolveRecordActor(base44, req, body);
  if (!actor) {
    return Response.json({ error: 'Not authorized.' }, { status: 401 });
  }

  if (!canReadMessageLogs(actor.kind)) {
    return Response.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), MAX_LIMIT);
  const sort = typeof body.sort === 'string' && body.sort ? body.sort : '-created_date';
  const logs = base44.asServiceRole.entities.MessageLog;

  try {
    if (actor.kind === 'admin') {
      const query = body.query && typeof body.query === 'object' ? body.query : {};
      const items = await logs.filter(query, sort, limit);
      return Response.json({ items: items || [] });
    }

    if (actor.kind !== 'sales') {
      return Response.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const allowed = salesMessageEmails(actor);
    const requested = String(body.from_email || '').trim().toLowerCase();

    if (requested && !allowed.includes(requested)) {
      return Response.json({ error: 'Not authorized for this mailbox.' }, { status: 403 });
    }

    const sendingFrom = requested || allowed[0] || actor.email;
    const items = await logs.filter(
      { message_type: 'email', source: 'email_hub', sales_member_email: sendingFrom },
      sort,
      limit
    );
    return Response.json({ items: items || [] });
  } catch (error) {
    return Response.json({ error: (error as Error).message || 'Could not load messages.' }, { status: 500 });
  }
}