/**
 * empMailbox — the employee Email Hub API.
 *
 * Every read and write goes through the connected employee's own provider
 * mailbox. There is no cross-provider fallback and no company-address
 * substitution: a failure is reported, never hidden behind another sender.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { resolveActor, resolveTargetMember, accountFor, assertMailboxOwner, audit } from '../../shared/empComm/access.ts';
import { adapterFor, requireCapability } from '../../shared/empComm/registry.ts';
import { accessTokenFor, upsertMessage, storeMessages, contactForAddress, logCrmActivity } from '../../shared/empComm/store.ts';
import { tenantFor } from '../../shared/empComm/tenant.ts';

const asList = (v: any) => (Array.isArray(v) ? v : v?.items || []);

/**
 * Exact-match read without paging options: this entity layer silently returns
 * an empty set when a read is given paging options, so ordering and slicing
 * happen here instead.
 */
async function rowsFor(base44: any, query: any) {
  const rows = asList(await base44.asServiceRole.entities.EmployeeMessage.filter(query));
  return rows;
}

const newestFirst = (rows: any[], take = 25) =>
  [...rows]
    .sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')))
    .slice(0, take);

function normaliseAddresses(value: any) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list.map((entry) => String(entry || '').trim().toLowerCase()).filter((entry) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry));
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'inbox');

    const actorResult = await resolveActor(base44, req, body);
    if (!actorResult.ok) return Response.json({ error: actorResult.error }, { status: actorResult.status });
    const actor = actorResult.actor;

    const target = await resolveTargetMember(base44, actor, body.memberId);
    if (!target.ok) return Response.json({ error: target.error }, { status: target.status });

    // Mailbox CONTENT is owner-only, regardless of administrator status.
    const ownerError = assertMailboxOwner(actor, target.memberId);
    if (ownerError) return Response.json({ error: ownerError }, { status: 403 });

    const account = await accountFor(base44, target.memberId, body.provider || undefined);
    if (!account || account.status !== 'connected') {
      return Response.json(
        {
          error: 'Google Workspace account connection required.',
          needs_connection: true,
          member_id: target.memberId,
          account_status: account?.status || 'none',
        },
        { status: 409 }
      );
    }

    const adapter = adapterFor(account.provider);
    const token = await accessTokenFor(base44, account);
    const tenant = tenantFor(target.member);

    const capability = (name: string) => requireCapability(adapter, name);

    if (action === 'inbox' || action === 'search') {
      if (capability('mail')) return Response.json({ error: capability('mail') }, { status: 400 });
      const folder = action === 'search' ? String(body.folder || 'inbox') : String(body.folder || 'inbox');

      // Drafts live in this app's own store. They are never pushed into the
      // provider's draft folder, so listing provider drafts would show an empty
      // folder while saved drafts existed.
      if (folder === 'drafts') {
        const rows = newestFirst(await rowsFor(base44, { account_id: account.id, folder: 'drafts' }));
        const needle = action === 'search' ? String(body.query || '').trim().toLowerCase() : '';
        const matched = needle
          ? rows.filter((row: any) =>
              `${row.subject || ''} ${row.snippet || ''} ${(row.to_emails || []).join(' ')}`.toLowerCase().includes(needle)
            )
          : rows;
        return Response.json({
          provider: account.provider,
          email_address: account.email_address,
          folder,
          messages: matched.map((row: any) => ({
            id: row.id,
            provider_message_id: row.provider_message_id,
            thread_id: row.thread_id,
            subject: row.subject,
            from_email: row.from_email,
            to_emails: row.to_emails || [],
            cc_emails: row.cc_emails || [],
            body_html: row.body_html || '',
            snippet: row.snippet,
            occurred_at: row.occurred_at,
            is_read: true,
            has_attachments: !!row.has_attachments,
            // Carried on the draft itself so reopening one restores its files.
            attachments: row.attachments || [],
            folder: row.folder,
          })),
        });
      }

      const messages = await adapter.listMessages(token, {
        folder,
        query: action === 'search' ? String(body.query || '') : '',
        limit: Number(body.limit || 25),
      });

      // Store the summary so the CRM and AI command layer have a local record,
      // and so a retried sync is idempotent. One batch, not one call per message.
      const stored = await storeMessages(base44, account, target.member, messages);

      return Response.json({
        provider: account.provider,
        email_address: account.email_address,
        folder,
        messages: stored.map((row) => ({
          id: row.id,
          provider_message_id: row.provider_message_id,
          thread_id: row.thread_id,
          subject: row.subject,
          from_email: row.from_email,
          from_name: row.from_name,
          to_emails: row.to_emails,
          snippet: row.snippet,
          occurred_at: row.occurred_at,
          is_read: row.is_read,
          has_attachments: row.has_attachments,
          folder: row.folder,
        })),
      });
    }

    if (action === 'get') {
      if (!body.messageId) return Response.json({ error: 'messageId is required' }, { status: 400 });
      const full = await adapter.getMessage(token, body.messageId);
      const row = await upsertMessage(base44, account, target.member, full);
      if (row.has_attachments) {
        await adapter.modifyMessage(token, body.messageId, { markRead: true }).catch(() => {});
      }
      const contact = await contactForAddress(base44, full.from_email);
      if (contact && !row.contact_id) {
        await base44.asServiceRole.entities.EmployeeMessage.update(row.id, { contact_id: contact.id });
      }
      return Response.json({
        provider: account.provider,
        message: {
          id: row.id,
          provider_message_id: row.provider_message_id,
          thread_id: row.thread_id,
          subject: row.subject,
          from_email: row.from_email,
          to_emails: row.to_emails,
          cc_emails: row.cc_emails,
          body_html: row.body_html,
          body_text: row.body_text,
          occurred_at: row.occurred_at,
          attachments: row.attachments || [],
          contact_id: contact?.id || '',
        },
      });
    }

    if (action === 'attachment') {
      if (!body.messageId || !body.attachmentId) {
        return Response.json({ error: 'messageId and attachmentId are required' }, { status: 400 });
      }
      const content = await adapter.getAttachment(token, body.messageId, body.attachmentId);
      return Response.json({ content_base64: content });
    }

    if (action === 'send' || action === 'reply' || action === 'forward') {
      const to = normaliseAddresses(body.to);
      if (action === 'send' && !to.length) return Response.json({ error: 'Add at least one valid recipient address.' }, { status: 400 });
      if (action === 'forward' && !to.length) return Response.json({ error: 'Choose who to forward this message to.' }, { status: 400 });
      const subject = String(body.subject || '').trim();
      if (action === 'send' && !subject) return Response.json({ error: 'A subject is required.' }, { status: 400 });
      const html = String(body.html || '');
      if (!html.trim()) return Response.json({ error: 'Write a message before sending.' }, { status: 400 });

      const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
        .filter((file: any) => file?.filename && file?.content_base64)
        .slice(0, 10);

      let result;
      if (action === 'reply' && account.provider === 'microsoft') {
        if (!body.messageId) return Response.json({ error: 'Choose the email you are replying to.' }, { status: 400 });
        result = await adapter.replyToMessage(token, body.messageId, {
          html,
          all: !!body.replyAll,
          attachments,
        });
      } else if (action === 'forward' && account.provider === 'microsoft') {
        if (!body.messageId) return Response.json({ error: 'Choose the email you are forwarding.' }, { status: 400 });
        result = await adapter.forwardMessage(token, body.messageId, { to, html, attachments });
      } else {
        const original = body.messageId
          ? asList(await base44.asServiceRole.entities.EmployeeMessage.filter({ account_id: account.id, provider_message_id: body.messageId }))[0]
          : null;
        result = await adapter.sendMessage(token, {
          from: account.email_address,
          to,
          cc: normaliseAddresses(body.cc),
          bcc: normaliseAddresses(body.bcc),
          subject: subject || (original?.subject ? `Re: ${original.subject}` : '(no subject)'),
          html,
          threadId: body.threadId || original?.thread_id || '',
          inReplyTo: body.inReplyTo || '',
          references: body.references || '',
          attachments,
        });
      }

      const messageRow = await upsertMessage(base44, account, target.member, {
        provider_message_id: result.provider_message_id || `local_${crypto.randomUUID()}`,
        thread_id: result.thread_id || '',
        direction: 'outbound',
        folder: 'sent',
        from_email: account.email_address,
        to_emails: to,
        cc_emails: normaliseAddresses(body.cc),
        subject: subject || '(no subject)',
        snippet: String(html).replace(/<[^>]+>/g, ' ').slice(0, 180),
        body_html: html,
        body_text: String(html).replace(/<[^>]+>/g, ' ').trim(),
        occurred_at: new Date().toISOString(),
        is_read: true,
        has_attachments: attachments.length > 0,
        attachments: attachments.map((file: any) => ({
          filename: file.filename,
          mime_type: file.mime_type || 'application/octet-stream',
          size: 0,
        })),
      });

      const contact = await contactForAddress(base44, to[0] || '');
      await logCrmActivity(base44, {
        member: target.member,
        account,
        message: messageRow,
        contact,
        kind: 'outbound',
      });

      await audit(base44, {
        action: action === 'reply' ? 'reply' : action === 'forward' ? 'forward' : 'send',
        actor_member_id: actor.memberId,
        account_id: account.id,
        provider: account.provider,
        target: to.join(', '),
        result: 'success',
      });

      // A draft that has just been sent must not stay sitting in Drafts.
      if (body.draftId) {
        const sentDraft = (
          await rowsFor(base44, {
            account_id: account.id,
            provider_message_id: String(body.draftId),
            folder: 'drafts',
          })
        )[0];
        if (sentDraft) await base44.asServiceRole.entities.EmployeeMessage.delete(sentDraft.id);
      }

      return Response.json({ success: true, message: messageRow });
    }

    if (action === 'discardDraft') {
      const draftId = String(body.draftId || '');
      if (!draftId) return Response.json({ error: 'draftId is required' }, { status: 400 });
      const row = (
        await rowsFor(base44, { account_id: account.id, provider_message_id: draftId, folder: 'drafts' })
      )[0];
      if (row) await base44.asServiceRole.entities.EmployeeMessage.delete(row.id);
      return Response.json({ success: true });
    }

    if (action === 'draft') {
      const draftId = String(body.draftId || '');
      // Attachments are part of the draft. The bytes live in private storage and
      // only the reference is kept here, so a draft can never bloat the record.
      const draftAttachments = (Array.isArray(body.attachments) ? body.attachments : [])
        .filter((file: any) => file?.filename && file?.file_uri)
        .slice(0, 10)
        .map((file: any) => ({
          filename: String(file.filename),
          mime_type: String(file.mime_type || 'application/octet-stream'),
          size: Number(file.size || 0),
          file_uri: String(file.file_uri),
        }));
      const payload = {
        tenant_id: tenant,
        account_id: account.id,
        sales_member_id: target.memberId,
        provider: account.provider,
        provider_message_id: draftId || `draft_${crypto.randomUUID()}`,
        thread_id: String(body.threadId || ''),
        direction: 'outbound',
        folder: 'drafts',
        from_email: account.email_address,
        to_emails: normaliseAddresses(body.to),
        cc_emails: normaliseAddresses(body.cc),
        subject: String(body.subject || '(no subject)'),
        body_html: String(body.html || ''),
        body_text: String(body.html || '').replace(/<[^>]+>/g, ' ').trim(),
        snippet: String(body.html || '').replace(/<[^>]+>/g, ' ').slice(0, 180),
        has_attachments: draftAttachments.length > 0,
        attachments: draftAttachments,
        occurred_at: new Date().toISOString(),
      };
      const existing = draftId
        ? asList(await base44.asServiceRole.entities.EmployeeMessage.filter({ account_id: account.id, provider_message_id: draftId }))[0]
        : null;
      const saved = existing
        ? await base44.asServiceRole.entities.EmployeeMessage.update(existing.id, payload)
        : await base44.asServiceRole.entities.EmployeeMessage.create(payload);
      return Response.json({ success: true, draft: saved });
    }

    if (action === 'archive' || action === 'trash' || action === 'markRead') {
      if (!body.messageId) return Response.json({ error: 'messageId is required' }, { status: 400 });
      await adapter.modifyMessage(token, body.messageId, {
        archive: action === 'archive',
        trash: action === 'trash',
        markRead: action === 'markRead',
      });
      const row = asList(await base44.asServiceRole.entities.EmployeeMessage.filter({ account_id: account.id, provider_message_id: body.messageId }))[0];
      if (row) {
        await base44.asServiceRole.entities.EmployeeMessage.update(row.id, {
          folder: action === 'trash' ? 'trash' : action === 'archive' ? 'archive' : row.folder,
          is_archived: action === 'archive',
          is_read: action === 'markRead' ? true : row.is_read,
        });
      }
      return Response.json({ success: true });
    }

    if (action === 'thread') {
      if (!body.threadId) return Response.json({ error: 'threadId is required' }, { status: 400 });
      const rows = asList(
        await base44.asServiceRole.entities.EmployeeMessage.filter(
          { account_id: account.id, thread_id: body.threadId },
          { sort: 'occurred_at', limit: 50 }
        )
      );
      return Response.json({ messages: rows });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[empMailbox]', error?.message);
    return Response.json({ error: error?.message || 'The mailbox request could not be completed.' }, { status: 500 });
  }
}