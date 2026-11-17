/**
 * empSchedule — scheduled employee email.
 *
 * A scheduled message is always sent from the employee's own connected mailbox
 * at its due time. If that authorization has expired, the message fails and the
 * employee is told; it is never re-sent from a company address instead.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { resolveActor, resolveTargetMember, accountFor, assertMailboxOwner, audit } from '../../shared/empComm/access.ts';
import { adapterFor } from '../../shared/empComm/registry.ts';
import { accessTokenFor, upsertMessage, contactForAddress, logCrmActivity } from '../../shared/empComm/store.ts';
import { tenantFor } from '../../shared/empComm/tenant.ts';

const asList = (v: any) => (Array.isArray(v) ? v : v?.items || []);

const addresses = (value: any) =>
  (Array.isArray(value) ? value : String(value || '').split(/[,;]/))
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry));

/** Sends one due message through its owner's mailbox. Returns a status string. */
async function dispatch(base44, scheduled) {
  const account = await base44.asServiceRole.entities.EmployeeEmailAccount.get(scheduled.account_id).catch(() => null);
  if (!account || account.status !== 'connected') {
    return { status: 'failed', error: 'The mailbox is not connected. Reconnect it and reschedule the email.' };
  }
  if (account.sales_member_id !== scheduled.sales_member_id) {
    return { status: 'failed', error: 'This scheduled email does not belong to the connected mailbox.' };
  }
  const adapter = adapterFor(account.provider);
  let token;
  try {
    token = await accessTokenFor(base44, account);
  } catch (error: any) {
    return { status: 'failed', error: error?.message || 'The mailbox authorization expired.' };
  }
  const member = await base44.asServiceRole.entities.SalesTeamMember.get(scheduled.sales_member_id).catch(() => null);
  if (!member) return { status: 'failed', error: 'The employee record was not found.' };

  try {
    const result = await adapter.sendMessage(token, {
      from: account.email_address,
      to: scheduled.to_emails || [],
      cc: scheduled.cc_emails || [],
      bcc: scheduled.bcc_emails || [],
      subject: scheduled.subject,
      html: scheduled.body_html,
      threadId: scheduled.thread_id || '',
      inReplyTo: scheduled.in_reply_to || '',
      references: scheduled.references || '',
      attachments: scheduled.attachments || [],
    });

    const messageRow = await upsertMessage(base44, account, member, {
      provider_message_id: result.provider_message_id || `sched_${scheduled.id}`,
      thread_id: result.thread_id || scheduled.thread_id || '',
      direction: 'outbound',
      folder: 'sent',
      from_email: account.email_address,
      to_emails: scheduled.to_emails || [],
      cc_emails: scheduled.cc_emails || [],
      subject: scheduled.subject,
      body_html: scheduled.body_html,
      body_text: String(scheduled.body_html || '').replace(/<[^>]+>/g, ' ').trim(),
      snippet: String(scheduled.body_html || '').replace(/<[^>]+>/g, ' ').slice(0, 180),
      occurred_at: new Date().toISOString(),
      is_read: true,
    });

    const contact = await contactForAddress(base44, (scheduled.to_emails || [])[0] || '');
    await logCrmActivity(base44, { member, account, message: messageRow, contact, kind: 'outbound' });

    return { status: 'sent', provider_message_id: result.provider_message_id || messageRow.provider_message_id };
  } catch (error: any) {
    return { status: 'failed', error: error?.message || 'The provider rejected this message.' };
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');

    // Background sweep: called by the scheduler as an administrator.
    if (action === 'sweep') {
      const user = await base44.auth.me().catch(() => null);
      if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

      const page = await base44.asServiceRole.entities.EmployeeScheduledMessage.filter(
        { status: 'pending', send_at: { $lte: new Date().toISOString() } },
        { sort: 'send_at', limit: 20 }
      );
      const due = page.items || [];
      let sent = 0;
      let failed = 0;

      for (const item of due) {
        // Claim the row so a retry of the same sweep cannot double-send.
        const claimed = await base44.asServiceRole.entities.EmployeeScheduledMessage.updateMany(
          { id: item.id, status: 'pending' },
          { $set: { status: 'sending', attempts: Number(item.attempts || 0) + 1 } }
        ).catch(() => ({ updated: 0 }));
        if (!claimed?.updated) continue;

        const outcome = await dispatch(base44, item);
        if (outcome.status === 'sent') {
          sent++;
          await base44.asServiceRole.entities.EmployeeScheduledMessage.update(item.id, {
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: outcome.provider_message_id || '',
            last_error: '',
          });
        } else {
          failed++;
          const attempts = Number(item.attempts || 0) + 1;
          await base44.asServiceRole.entities.EmployeeScheduledMessage.update(item.id, {
            // Transient provider trouble gets a short retry window; a permanent
            // failure stops and stays visible to the employee.
            status: attempts >= 3 ? 'failed' : 'pending',
            last_error: outcome.error || 'The message could not be sent.',
          });
          await base44.asServiceRole.entities.PendingNotification.create({
            user_email: item.sales_member_email || '',
            sales_member_id: item.sales_member_id,
            title: attempts >= 3 ? 'Scheduled email failed' : 'Scheduled email retry',
            message:
              attempts >= 3
                ? `A scheduled email to ${(item.to_emails || []).join(', ')} could not be sent: ${outcome.error || 'unknown error'}`
                : `A scheduled email will retry shortly: ${outcome.error || 'temporary provider error'}`,
            type: 'email',
            read: false,
          }).catch(() => {});
        }
      }

      return Response.json({ success: true, due: due.length, sent, failed, has_more: page.has_more });
    }

    const actorResult = await resolveActor(base44, req, body);
    if (!actorResult.ok) return Response.json({ error: actorResult.error }, { status: actorResult.status });
    const actor = actorResult.actor;

    const target = await resolveTargetMember(base44, actor, body.memberId);
    if (!target.ok) return Response.json({ error: target.error }, { status: target.status });
    const ownerError = assertMailboxOwner(actor, target.memberId);
    if (ownerError) return Response.json({ error: ownerError }, { status: 403 });
    const tenant = tenantFor(target.member);

    if (action === 'list') {
      const rows = await base44.asServiceRole.entities.EmployeeScheduledMessage
        .filter({ tenant_id: tenant, sales_member_id: target.memberId }, { sort: 'send_at', limit: 50 })
        .catch(() => []);
      return Response.json({ scheduled: asList(rows) });
    }

    if (action === 'create') {
      const to = addresses(body.to);
      if (!to.length) return Response.json({ error: 'Add at least one valid recipient address.' }, { status: 400 });
      if (!String(body.subject || '').trim()) return Response.json({ error: 'A subject is required.' }, { status: 400 });
      if (!String(body.html || '').trim()) return Response.json({ error: 'Write a message before scheduling it.' }, { status: 400 });

      const sendAt = new Date(body.send_at);
      if (Number.isNaN(sendAt.getTime())) return Response.json({ error: 'Choose when this email should send.' }, { status: 400 });
      if (sendAt.getTime() < Date.now() - 60000) {
        return Response.json({ error: 'Choose a time in the future.' }, { status: 400 });
      }

      const account = await accountFor(base44, target.memberId, body.provider || undefined);
      if (!account || account.status !== 'connected') {
        return Response.json({ error: 'Google Workspace account connection required.' }, { status: 409 });
      }

      const saved = await base44.asServiceRole.entities.EmployeeScheduledMessage.create({
        tenant_id: tenant,
        sales_member_id: target.memberId,
        sales_member_email: target.member.email || '',
        account_id: account.id,
        provider: account.provider,
        to_emails: to,
        cc_emails: addresses(body.cc),
        bcc_emails: addresses(body.bcc),
        subject: String(body.subject),
        body_html: String(body.html),
        attachments: (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 10),
        thread_id: String(body.threadId || ''),
        in_reply_to: String(body.inReplyTo || ''),
        references: String(body.references || ''),
        contact_id: String(body.contactId || ''),
        send_at: sendAt.toISOString(),
        timezone: String(body.timezone || 'America/New_York'),
        status: 'pending',
        attempts: 0,
      });

      await audit(base44, {
        action: 'schedule',
        actor_member_id: actor.memberId,
        account_id: account.id,
        provider: account.provider,
        target: to.join(', '),
        result: 'success',
      });
      return Response.json({ success: true, scheduled: saved });
    }

    if (action === 'cancel') {
      if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });
      const row = asList(
        await base44.asServiceRole.entities.EmployeeScheduledMessage.filter({ id: body.id, tenant_id: tenant }, { limit: 1 })
      )[0];
      if (!row) return Response.json({ error: 'That scheduled email was not found.' }, { status: 404 });
      if (row.sales_member_id !== target.memberId) {
        return Response.json({ error: 'Another employee owns that scheduled email.' }, { status: 403 });
      }
      if (row.status !== 'pending') {
        return Response.json({ error: 'That email is already being sent or has been sent.' }, { status: 409 });
      }
      await base44.asServiceRole.entities.EmployeeScheduledMessage.update(row.id, {
        status: 'cancelled',
        last_error: 'Cancelled by the employee before sending.',
      });
      await audit(base44, { action: 'cancel_schedule', actor_member_id: actor.memberId, target: row.subject, result: 'success' });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[empSchedule]', error?.message);
    return Response.json({ error: error?.message || 'The scheduling request could not be completed.' }, { status: 500 });
  }
}