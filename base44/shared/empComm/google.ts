/**
 * Google Workspace adapter — Gmail and Google Calendar.
 *
 * Every capability is a real API call. Where Google genuinely cannot do
 * something the adapter says so rather than pretending, so the Email Hub can
 * report an honest capability state instead of silently degrading.
 */

import { buildMime, stripHtml, toGmailRaw } from './mime.ts';
import { sanitizeEmailHtml } from './sanitize.ts';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CAL = 'https://www.googleapis.com/calendar/v3';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
];

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function call(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...auth(token), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.error?.message || data?.error_description || `Google returned ${res.status}`;
    const error: any = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

function header(payload: any, name: string) {
  const list = payload?.headers || [];
  const found = list.find((h: any) => String(h.name).toLowerCase() === String(name).toLowerCase());
  return found?.value || '';
}

function decodeBase64Url(value: string) {
  const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(escape(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))));
  } catch {
    return '';
  }
}

function walkParts(part: any, out: any[] = []) {
  if (!part) return out;
  out.push(part);
  (part.parts || []).forEach((child: any) => walkParts(child, out));
  return out;
}

function bodyOf(payload: any) {
  const parts = walkParts(payload);
  const htmlPart = parts.find((p) => p.mimeType === 'text/html' && p.body?.data);
  const textPart = parts.find((p) => p.mimeType === 'text/plain' && p.body?.data);
  const html = htmlPart ? decodeBase64Url(htmlPart.body.data) : '';
  const text = textPart ? decodeBase64Url(textPart.body.data) : '';
  return { html: html ? sanitizeEmailHtml(html) : '', text: text || stripHtml(html) };
}

function attachmentsOf(payload: any) {
  return walkParts(payload)
    .filter((p) => p.filename && p.body?.attachmentId)
    .map((p) => ({
      id: p.body.attachmentId,
      filename: p.filename,
      mime_type: p.mimeType || 'application/octet-stream',
      size: Number(p.body.size || 0),
    }));
}

const parseAddressList = (value: string) =>
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

function folderOf(labels: string[]) {
  const set = (labels || []).map((l) => String(l).toUpperCase());
  if (set.includes('TRASH')) return 'trash';
  if (set.includes('DRAFT')) return 'drafts';
  if (set.includes('SENT')) return 'sent';
  if (set.includes('INBOX')) return 'inbox';
  return 'archive';
}

export const googleAdapter = {
  key: 'google',
  label: 'Google Workspace',
  capabilities: {
    mail: true,
    calendar: true,
    drafts: false,
    scheduling: false,
    labels: true,
    contacts: false,
    unsupported: {
      scheduling: 'Google has no scheduled-send API. Arriv One stores the message and sends it at the chosen time through the same mailbox.',
      contacts: 'Contact synchronisation needs the Google Contacts scope, which is not granted to this connection.',
      drafts: 'Drafts are stored inside Arriv One until sent; Gmail drafts are not created in the mailbox.',
    },
  },

  authorizeUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async exchangeCode({ code, clientId, clientSecret, redirectUri }) {
    return call('https://oauth2.googleapis.com/token', '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    }).catch(async () => {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error_description || 'Google rejected the authorization code.');
      return data;
    });
  },

  async refresh({ refreshToken, clientId, clientSecret }) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(data?.error_description || 'Google authorization expired. Reconnect the mailbox.');
    }
    return data;
  },

  async profile(token) {
    const info = await call(`${GMAIL}/profile`, token);
    return { email: info.emailAddress || '', name: info.emailAddress || '' };
  },

  async listMessages(token, { folder = 'inbox', query = '', limit = 25 } = {}) {
    const filter =
      folder === 'sent' ? 'in:sent' : folder === 'drafts' ? 'in:drafts' : folder === 'trash' ? 'in:trash' : 'in:inbox';
    const q = `${filter}${query ? ` ${query}` : ''}`;
    const list = await call(
      `${GMAIL}/messages?q=${encodeURIComponent(q)}&maxResults=${Math.min(Number(limit) || 25, 50)}`,
      token
    );
    const ids = (list.messages || []).map((m: any) => m.id);
    const messages = [];
    for (let i = 0; i < ids.length; i += 8) {
      const batch = await Promise.allSettled(
        ids.slice(i, i + 8).map((id: string) => call(`${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`, token))
      );
      for (const item of batch) {
        if (item.status !== 'fulfilled') continue;
        const msg: any = item.value;
        messages.push({
          provider_message_id: msg.id,
          thread_id: msg.threadId,
          snippet: msg.snippet || '',
          subject: header(msg.payload, 'Subject') || '(no subject)',
          from_email: parseAddressList(header(msg.payload, 'From'))[0] || '',
          to_emails: parseAddressList(header(msg.payload, 'To')),
          cc_emails: parseAddressList(header(msg.payload, 'Cc')),
          occurred_at: new Date(Number(msg.internalDate || Date.now())).toISOString(),
          is_read: !(msg.labelIds || []).includes('UNREAD'),
          folder: folderOf(msg.labelIds || []),
          has_attachments: !!msg.payload?.filename || walkParts(msg.payload).some((p) => p.filename),
          internet_message_id: header(msg.payload, 'Message-ID'),
        });
      }
    }
    return messages;
  },

  async getMessage(token, messageId) {
    const msg = await call(`${GMAIL}/messages/${messageId}?format=full`, token);
    const body = bodyOf(msg.payload);
    return {
      provider_message_id: msg.id,
      thread_id: msg.threadId,
      subject: header(msg.payload, 'Subject') || '(no subject)',
      from_email: parseAddressList(header(msg.payload, 'From'))[0] || '',
      to_emails: parseAddressList(header(msg.payload, 'To')),
      cc_emails: parseAddressList(header(msg.payload, 'Cc')),
      occurred_at: new Date(Number(msg.internalDate || Date.now())).toISOString(),
      is_read: !(msg.labelIds || []).includes('UNREAD'),
      folder: folderOf(msg.labelIds || []),
      snippet: msg.snippet || '',
      body_html: body.html,
      body_text: body.text,
      internet_message_id: header(msg.payload, 'Message-ID'),
      references: header(msg.payload, 'References'),
      has_attachments: attachmentsOf(msg.payload).length > 0,
      attachments: attachmentsOf(msg.payload),
    };
  },

  async getAttachment(token, messageId, attachmentId) {
    const data = await call(`${GMAIL}/messages/${messageId}/attachments/${attachmentId}`, token);
    return String(data?.data || '').replace(/-/g, '+').replace(/_/g, '/');
  },

  async sendMessage(token, payload) {
    const raw = toGmailRaw(
      buildMime({
        from: payload.from,
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        inReplyTo: payload.inReplyTo,
        references: payload.references,
        attachments: payload.attachments,
      })
    );
    const body: any = { raw };
    if (payload.threadId) body.threadId = payload.threadId;
    const sent = await call(`${GMAIL}/messages/send`, token, { method: 'POST', body: JSON.stringify(body) });
    return { provider_message_id: sent.id, thread_id: sent.threadId };
  },

  async modifyMessage(token, messageId, { archive, unarchive, markRead, trash }) {
    if (trash) {
      await call(`${GMAIL}/messages/${messageId}/trash`, token, { method: 'POST' });
      return;
    }
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];
    if (archive) removeLabelIds.push('INBOX');
    if (unarchive) addLabelIds.push('INBOX');
    if (markRead) removeLabelIds.push('UNREAD');
    await call(`${GMAIL}/messages/${messageId}/modify`, token, {
      method: 'POST',
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
  },

  async listCalendars(token) {
    const data = await call(`${CAL}/users/me/calendarList`, token);
    return (data.items || []).map((c: any) => ({ id: c.id, name: c.summary, primary: !!c.primary }));
  },

  async listEvents(token, { timeMin, timeMax, limit = 25 }) {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(Math.min(Number(limit) || 25, 50)),
    });
    const data = await call(`${CAL}/calendars/primary/events?${params.toString()}`, token);
    return (data.items || []).map((e: any) => ({
      provider_event_id: e.id,
      title: e.summary || '(no title)',
      description: e.description || '',
      location: e.location || '',
      start_at: e.start?.dateTime || `${e.start?.date}T00:00:00Z`,
      end_at: e.end?.dateTime || `${e.end?.date}T00:00:00Z`,
      status: e.status || 'confirmed',
      html_link: e.htmlLink || '',
      organizer_email: e.organizer?.email || '',
      attendees: (e.attendees || []).map((a: any) => ({
        email: a.email,
        name: a.displayName || '',
        response_status: a.responseStatus || '',
      })),
    }));
  },

  async availability(token, { timeMin, timeMax, attendees }) {
    const data = await call(`${CAL}/freeBusy`, token, {
      method: 'POST',
      body: JSON.stringify({ timeMin, timeMax, items: attendees.map((email: string) => ({ id: email })) }),
    });
    const busy = data?.calendars?.[attendees[0]]?.busy || [];
    return { busy: busy.map((slot: any) => ({ start: slot.start, end: slot.end })) };
  },

  async createEvent(token, event) {
    const body = {
      summary: event.title,
      description: event.description || '',
      location: event.location || '',
      start: { dateTime: event.start_at, timeZone: event.timezone },
      end: { dateTime: event.end_at, timeZone: event.timezone },
      attendees: (event.attendees || []).map((a: any) => ({ email: a.email })),
    };
    const created = await call(`${CAL}/calendars/primary/events?sendUpdates=all`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { provider_event_id: created.id, html_link: created.htmlLink || '' };
  },

  async updateEvent(token, eventId, event) {
    const body: any = {};
    if (event.title !== undefined) body.summary = event.title;
    if (event.description !== undefined) body.description = event.description;
    if (event.location !== undefined) body.location = event.location;
    if (event.start_at && event.end_at) {
      body.start = { dateTime: event.start_at, timeZone: event.timezone };
      body.end = { dateTime: event.end_at, timeZone: event.timezone };
    }
    if (event.attendees) body.attendees = event.attendees.map((a: any) => ({ email: a.email }));
    await call(`${CAL}/calendars/primary/events/${eventId}?sendUpdates=all`, token, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return { provider_event_id: eventId };
  },

  async deleteEvent(token, eventId) {
    await call(`${CAL}/calendars/primary/events/${eventId}?sendUpdates=all`, token, { method: 'DELETE' });
    return { provider_event_id: eventId };
  },
};