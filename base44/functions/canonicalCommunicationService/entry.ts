import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveRepEmailConnection, getInboxViaConnection, getInboundEmail, markInboundEmailRead } from "../../shared/repEmailConnection.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, salesMemberId, contactEmails, toEmail, messageId } = body;

    if (!salesMemberId) return Response.json({ error: 'salesMemberId is required' }, { status: 400 });

    // Resolve the rep's email connection
    let connection;
    try {
      connection = await resolveRepEmailConnection(base44, salesMemberId);
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }

    if (action === 'thread_list' || !action) {
      // If no per-rep connection, fall back to app-level Gmail connector
      if (connection.type === 'none') {
        try {
          const gmailAccessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
          if (gmailAccessToken) {
            let query = 'in:inbox';
            if (toEmail) query = `in:inbox to:${toEmail}`;
            if (contactEmails?.length) {
              const fromQuery = contactEmails.filter(Boolean).map((e) => `from:${e}`).join(' OR ');
              query += ` (${fromQuery})`;
            }
            const searchRes = await fetch(
              `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=30`,
              { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
            );
            if (!searchRes.ok) return Response.json({ error: 'Gmail search failed' }, { status: 500 });
            const searchData = await searchRes.json();
            const messages = searchData.messages || [];
            const threads = await Promise.all(
              messages.slice(0, 20).map(async (msg) => {
                const msgRes = await fetch(
                  `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
                  { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
                );
                if (!msgRes.ok) return null;
                const msgData = await msgRes.json();
                const headers = msgData.payload?.headers || [];
                const get = (name) => headers.find((h) => h.name === name)?.value || '';
                return {
                  id: msg.id,
                  from: get('From'),
                  subject: get('Subject'),
                  date: get('Date'),
                  snippet: msgData.snippet || '',
                  messageId: get('Message-ID'),
                  references: get('References'),
                };
              })
            );
            return Response.json({ threads: threads.filter(Boolean), available: true });
          }
        } catch (_) {}
        return Response.json({ threads: [], available: false, reason: 'Email not connected. Ask your admin to connect an email account.' });
      }

      // Use per-rep connection
      const result = await getInboxViaConnection(base44, connection, { toEmail, contactEmails });
      return Response.json(result);
    }

    // --- Message get (open individual email) ---
    if (action === 'message_get') {
      if (!messageId) return Response.json({ error: 'messageId is required' }, { status: 400 });

      // SMTP connections: read from InboundEmail entity
      if (connection.type === 'smtp') {
        const email = await getInboundEmail(base44, messageId);
        if (!email) return Response.json({ error: 'Email not found' }, { status: 404 });
        await markInboundEmailRead(base44, messageId);
        return Response.json({
          message: {
            id: email.id,
            subject: email.subject || '(no subject)',
            from_email: email.from_email,
            from_name: email.from_name,
            to_email: email.to_email,
            date: email.received_at,
            body_text: email.body_text || '',
            body_html: email.body_html || '',
            is_read: true,
          },
          provider: 'smtp_inbound',
        });
      }

      // Gmail/Microsoft: fetch full message via provider API
      // (Future: implement full message fetch for OAuth providers)
      return Response.json({ error: 'message_get not yet supported for this connection type' }, { status: 400 });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});