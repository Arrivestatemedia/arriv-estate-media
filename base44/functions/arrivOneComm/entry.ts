/**
 * arrivOneComm — the communications half of Ask Arriv.
 *
 * This is not a second assistant: it is the same command pipeline, extended with
 * email and calendar intents. Read-only requests answer immediately. Anything
 * that would send a message, invite an attendee or change a meeting returns a
 * reviewable proposal and writes nothing — the employee confirms it in the same
 * panel before it happens.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { authorizeArrivOne } from '../../shared/arrivOneAuth.ts';
import { accountFor } from '../../shared/empComm/access.ts';
import { adapterFor } from '../../shared/empComm/registry.ts';
import { accessTokenFor } from '../../shared/empComm/store.ts';
import { matchContacts } from '../../shared/arrivOneCommand.ts';

const asList = (v: any) => (Array.isArray(v) ? v : v?.items || []);

const SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: [
        'email_send',
        'email_schedule',
        'email_read',
        'email_summarize',
        'email_list_sent',
        'calendar_list',
        'calendar_availability',
        'calendar_create',
        'unknown',
      ],
    },
    contact_name: { type: 'string' },
    recipient_emails: { type: 'array', items: { type: 'string' } },
    template_name: { type: 'string' },
    subject: { type: 'string' },
    body_html: { type: 'string' },
    send_at_iso: { type: 'string' },
    meeting_title: { type: 'string' },
    meeting_start_iso: { type: 'string' },
    meeting_end_iso: { type: 'string' },
    meeting_attendees: { type: 'array', items: { type: 'string' } },
    query: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['intent'],
};

const PROMPT = (text: string, now: string, tz: string, addresses: string[]) => `You turn what a Media Partner said into one email or calendar action inside Arriv One.

Now: ${now} in ${tz}.
Addresses on file for this employee's connected mailbox and matched contacts: ${addresses.join(', ') || 'none'}.

They said:
"""${text}"""

Rules, all mandatory:
1. Never invent an email address. If the recipient is not clearly identifiable from the addresses given, leave recipient_emails empty and put the reason in warnings.
2. A template name must be copied exactly as said; do not invent one.
3. Resolve relative times ("tomorrow at 9", "Thursday at 2") into full ISO 8601 datetimes in ${tz}. If the time is ambiguous, leave the field empty and warn instead of guessing.
4. body_html may only contain what they actually dictated. If they gave no body, leave it empty.
5. Choose email_read for "read my unread emails", email_summarize for "summarize the email from X", email_list_sent for "show what I sent today", calendar_list for "check my calendar", calendar_availability for "am I free", calendar_create for a meeting to be booked.
6. Return only the JSON object.`;

function parseIso(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || '').trim();
    if (!text) return Response.json({ error: 'Say what you would like to do.' }, { status: 400 });

    const auth = await authorizeArrivOne(base44, req, body);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const actor = auth.actor;

    const member = await base44.asServiceRole.entities.SalesTeamMember.get(actor.sales_member_id || actor.id).catch(() => null);
    if (!member) return Response.json({ error: 'Your employee record could not be found.' }, { status: 404 });

    const account = await accountFor(base44, member.id);
    if (!account || account.status !== 'connected') {
      return Response.json(
        { error: 'Google Workspace account connection required. Connect your mailbox before using email or calendar commands.', needs_connection: true },
        { status: 409 }
      );
    }

    // Resolve an obvious contact up front so the model can only use real addresses.
    const contacts = await matchContacts(base44, { full_name: text }).catch(() => []);
    const addresses = [account.email_address, ...contacts.map((c: any) => c.email).filter(Boolean)];

    const interpreted: any = await base44.integrations.Core.InvokeLLM({
      prompt: PROMPT(text, new Date().toISOString(), body.timezone || 'America/New_York', addresses),
      response_json_schema: SCHEMA,
    });

    const warnings = [...(interpreted?.warnings || [])];
    const recipients = (interpreted?.recipient_emails || [])
      .map((email: string) => String(email).toLowerCase())
      .filter((email: string) => addresses.includes(email));

    if ((interpreted?.intent || '').startsWith('email_send') || interpreted?.intent === 'email_schedule') {
      if (!recipients.length) warnings.push('No verified recipient address was found. Choose the contact before sending.');
    }

    const adapter = adapterFor(account.provider);
    const token = await accessTokenFor(base44, account).catch(() => '');

    // Read-only intents answer now — they change nothing.
    if (['email_read', 'email_summarize', 'email_list_sent'].includes(interpreted.intent) && token) {
      const folder = interpreted.intent === 'email_list_sent' ? 'sent' : 'inbox';
      const messages = await adapter.listMessages(token, { folder, limit: 10 });
      const rows = messages.map((message: any) => ({
        subject: message.subject,
        from: message.from_email,
        to: (message.to_emails || []).join(', '),
        at: message.occurred_at,
        snippet: message.snippet,
      }));
      return Response.json({
        intent: interpreted.intent,
        read_only: true,
        summary:
          interpreted.intent === 'email_read'
            ? `${rows.filter((row: any) => row).length} messages in ${folder}.`
            : interpreted.intent === 'email_list_sent'
            ? `${rows.length} sent messages.`
            : interpreted.intent === 'email_summarize'
            ? 'Here is the most recent message that matched.'
            : '',
        messages: rows,
        warnings,
      });
    }

    if (['calendar_list', 'calendar_availability'].includes(interpreted.intent) && token) {
      const events = await adapter.listEvents(token, {
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 7 * 86400000).toISOString(),
        limit: 15,
      });
      return Response.json({
        intent: interpreted.intent,
        read_only: true,
        summary: `${events.length} upcoming events this week.`,
        events: events.map((event: any) => ({ title: event.title, start_at: event.start_at, end_at: event.end_at })),
        warnings,
      });
    }

    // Write intents return a proposal only. The employee confirms it in the panel.
    if (interpreted.intent === 'email_send' || interpreted.intent === 'email_schedule') {
      const templateName = String(interpreted.template_name || '').trim();
      let subject = String(interpreted.subject || '');
      let html = String(interpreted.body_html || '');
      let template = null;

      if (templateName) {
        const rows = asList(
          await base44.asServiceRole.entities.EmployeeEmailTemplate
            .filter({ tenant_id: account.tenant_id, active: true }, { limit: 100 })
            .catch(() => [])
        );
        template =
          rows.find(
            (row: any) =>
              String(row.name).toLowerCase() === templateName.toLowerCase() &&
              (row.scope === 'company' || row.owner_member_id === member.id)
          ) || null;
        if (!template) {
          warnings.push(`No template named “${templateName}” is available to you.`);
        } else {
          subject = subject || template.subject || '';
          html = html || template.body_html || '';
        }
      }

      return Response.json({
        intent: interpreted.intent,
        needs_confirmation: true,
        proposal: {
          kind: 'email',
          to: recipients.join(', '),
          subject,
          html,
          template_id: template?.id || '',
          send_at: interpreted.intent === 'email_schedule' ? interpreted.send_at_iso || '' : '',
          contact_name: interpreted.contact_name || '',
        },
        warnings,
        message: 'Review the message, then confirm to send from your own mailbox.',
      });
    }

    if (interpreted.intent === 'calendar_create') {
      return Response.json({
        intent: interpreted.intent,
        needs_confirmation: true,
        proposal: {
          kind: 'meeting',
          title: String(interpreted.meeting_title || ''),
          start_at: interpreted.meeting_start_iso || '',
          end_at: interpreted.meeting_end_iso || '',
          attendees: (interpreted.meeting_attendees || []).filter((email: string) => addresses.includes(String(email).toLowerCase())),
        },
        warnings,
        message: 'Confirm the invitation before it is sent from your calendar.',
      });
    }

    return Response.json({
      intent: 'unknown',
      summary: 'That request could not be matched to an email or calendar action.',
      warnings,
    });
  } catch (error: any) {
    console.error('[arrivOneComm]', error?.message);
    return Response.json({ error: error?.message || 'That command could not be completed.' }, { status: 500 });
  }
}