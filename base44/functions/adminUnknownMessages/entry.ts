import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { verifyAdmin } from '../../shared/adminAuth.ts';

/**
 * Unknown-number texts.
 *
 * A thread is "unknown" when the message arrived on the shared company line from a number
 * the app knows nothing about: no sales rep owns the thread, the sender is not on any job
 * (client or media specialist), and no rep's phone matches it. Those messages reach
 * nobody's inbox, which is exactly what this screen exists to show.
 *
 * The admin phone is alerted by the SMS webhook itself, not from here.
 */

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

const norm = (value: any) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
};

function threadView(conversation: any) {
  return {
    id: conversation.id,
    from_number: conversation.from_number || '',
    contact_name: conversation.contact_name || '',
    last_message: conversation.last_message || '',
    last_message_at: conversation.last_message_at || conversation.updated_date || '',
    unread_count: conversation.unread_count || 0,
  };
}

/** Every number the app already knows as a client, media specialist or rep. */
async function knownNumbers(base44: any) {
  const known = new Set<string>();
  const [jobs, reps] = await Promise.all([
    base44.asServiceRole.entities.Job.list('-created_date', 1000).catch(() => []),
    base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500).catch(() => []),
  ]);
  for (const job of rowsOf(jobs)) {
    for (const value of [job.client_phone, job.booked_by_phone, job.backup_booked_by_phone]) {
      const digits = norm(value);
      if (digits) known.add(digits);
    }
  }
  for (const rep of rowsOf(reps)) {
    for (const value of [rep.phone, rep.phone_number, rep.twilio_phone_number, rep.mobile_phone]) {
      const digits = norm(value);
      if (digits) known.add(digits);
    }
  }
  return known;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth.authorized) {
      return Response.json({ ok: false, error: 'FORBIDDEN', message: 'Administrator access required.' }, { status: 403 });
    }

    const action = String(body?.action || 'list');

    if (action === 'list') {
      const [conversations, inbound, known] = await Promise.all([
        base44.asServiceRole.entities.SmsConversation.list('-last_message_at', 300),
        base44.asServiceRole.entities.SmsMessage.filter({ direction: 'inbound' }, '-created_date', 400),
        knownNumbers(base44),
      ]);

      const threadsWithInbound = new Set(
        rowsOf(inbound).map((message: any) => message.conversation_id).filter(Boolean),
      );
      const unknown = rowsOf(conversations).filter((conversation: any) => {
        if (conversation.sales_member_id) return false;
        if (!threadsWithInbound.has(conversation.id)) return false;
        const sender = norm(conversation.from_number);
        return Boolean(sender) && !known.has(sender);
      });

      return Response.json({ ok: true, conversations: unknown.map(threadView) });
    }

    if (action === 'thread') {
      const conversationId = String(body?.conversation_id || '');
      if (!conversationId) {
        return Response.json({ ok: false, error: 'conversation_id is required.' }, { status: 400 });
      }
      const conversation = rowsOf(
        await base44.asServiceRole.entities.SmsConversation.filter({ id: conversationId }),
      )[0];
      if (!conversation) {
        return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
      }
      const messages = rowsOf(
        await base44.asServiceRole.entities.SmsMessage.filter({ conversation_id: conversationId }, 'created_date', 300),
      );
      return Response.json({
        ok: true,
        conversation: threadView(conversation),
        messages: messages.map((message: any) => ({
          id: message.id,
          direction: message.direction,
          body: message.body || '',
          from_number: message.from_number || '',
          to_number: message.to_number || '',
          created_date: message.created_date || '',
          status: message.status || '',
        })),
      });
    }

    return Response.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
  } catch (error: any) {
    console.error('adminUnknownMessages error:', error);
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}