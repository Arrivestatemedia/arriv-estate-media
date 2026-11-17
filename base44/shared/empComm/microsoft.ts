/**
 * Microsoft 365 adapter — Outlook mail and Microsoft Calendar, via Graph.
 *
 * Delegated Graph permissions only. Nothing here uses application-wide mailbox
 * access, so a connection can never read another employee's mailbox.
 */

import { stripHtml } from './mime.ts';
import { sanitizeEmailHtml } from './sanitize.ts';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export const MICROSOFT_SCOPES = [
  'offline_access',
  'openid',
  'email',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.ReadWrite',
];

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function call(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...auth(token), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.error?.message || `Microsoft returned ${res.status}`;
    const error: any = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

function bodyOf(message: any) {
  const html = message?.body?.contentType === 'html' ? message.body.content : '';
  const text = message?.body?.contentType === 'text' ? message.body.content : '';
  return { html: html ? sanitizeEmailHtml(html) : '', text: text || stripHtml(html) };
}

const emailOf = (recipient: any) => recipient?.emailAddress?.address || '';
const nameOf = (recipient: any) => recipient?.emailAddress?.name || '';

const FOLDER = {
  inbox: 'inbox',
  sent: 'sentitems',
  drafts: 'drafts',
  archive: 'archive',
  trash: 'deleteditems',
};

export const microsoftAdapter = {
  key: 'microsoft',
  label: 'Microsoft 365',
  capabilities: {
    mail: true,
    calendar: true,
    drafts: false,
    scheduling: false,
    labels: false,
    contacts: false,
    unsupported: {
      scheduling: 'Microsoft Graph has no scheduled-send API. Arriv One stores the message and sends it at the chosen time through the same mailbox.',
      labels: 'Outlook categories are not Gmail labels; the mailbox uses folders instead.',
      contacts: 'Contact synchronisation needs the Contacts scope, which is not granted to this connection.',
      drafts: 'Drafts are stored inside Arriv One until sent; Outlook drafts are not created in the mailbox.',
    },
  },

  authorizeUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: MICROSOFT_SCOPES.join(' '),
      state,
      prompt: 'select_account',
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  },

  async exchangeCode({ code, clientId, clientSecret, redirectUri }) {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: MICROSOFT_SCOPES.join(' '),
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(data?.error_description || 'Microsoft rejected the authorization code.');
    }
    return data;
  },

  async refresh({ refreshToken, clientId, clientSecret }) {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        scope: MICROSOFT_SCOPES.join(' '),
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(data?.error_description || 'Microsoft authorization expired. Reconnect the mailbox.');
    }
    return data;
  },

  async profile(token) {
    const me = await call(`${GRAPH}/me`, token);
    return { email: me.mail || me.userPrincipalName || '', name: me.displayName || '' };
  },

  async listMessagesPage(token, { folder = 'inbox', query = '', limit = 25, pageToken = '' } = {}) {
    const folderId = FOLDER[folder] || 'inbox';
    const params = new URLSearchParams({
      $top: String(Math.min(Number(limit) || 25, 50)),
      $orderby: 'receivedDateTime desc',
      $select: 'id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview',
    });
    if (query) params.set('$search', `"${query}"`);
    if (pageToken) params.set('$skiptoken', pageToken);
    const data = await call(`${GRAPH}/me/mailFolders/${folderId}/messages?${params.toString()}`, token);
    const nextLink = data?.['@odata.nextLink'] || '';
    const skipToken = nextLink
      ? new URLSearchParams(nextLink.split('?')[1] || '').get('$skiptoken') || ''
      : '';
    const messages = (data?.value || []).map((m: any) => ({
      provider_message_id: m.id,
      thread_id: m.conversationId,
      snippet: m.bodyPreview || '',
      subject: m.subject || '(no subject)',
      from_email: emailOf(m.from),
      from_name: nameOf(m.from),
      to_emails: (m.toRecipients || []).map(emailOf),
      cc_emails: (m.ccRecipients || []).map(emailOf),
      occurred_at: m.receivedDateTime || new Date().toISOString(),
      is_read: !!m.isRead,
      folder,
      has_attachments: !!m.hasAttachments,
    }));
    return { messages, next_page_token: skipToken };
  },

  async listMessages(token, options = {}) {
    const page = await this.listMessagesPage(token, options);
    return page.messages;
  },

  async getMessage(token, messageId) {
    const m = await call(
      `${GRAPH}/me/messages/${messageId}?$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,body,hasAttachments,internetMessageId`,
      token
    );
    const body = bodyOf(m);
    const attachments = m.hasAttachments
      ? await call(`${GRAPH}/me/messages/${messageId}/attachments?$select=id,name,contentType,size`, token)
      : { value: [] };
    return {
      provider_message_id: m.id,
      thread_id: m.conversationId,
      subject: m.subject || '(no subject)',
      from_email: emailOf(m.from),
      from_name: nameOf(m.from),
      to_emails: (m.toRecipients || []).map(emailOf),
      cc_emails: (m.ccRecipients || []).map(emailOf),
      occurred_at: m.receivedDateTime || new Date().toISOString(),
      is_read: !!m.isRead,
      snippet: stripHtml(body.html).slice(0, 200),
      body_html: body.html,
      body_text: body.text,
      internet_message_id: m.internetMessageId || '',
      has_attachments: (attachments?.value || []).length > 0,
      attachments: (attachments?.value || []).map((a: any) => ({
        id: a.id,
        filename: a.name,
        mime_type: a.contentType || 'application/octet-stream',
        size: Number(a.size || 0),
      })),
    };
  },

  async getAttachment(token, messageId, attachmentId) {
    const data = await call(`${GRAPH}/me/messages/${messageId}/attachments/${attachmentId}`, token);
    return String(data?.contentBytes || '');
  },

  async sendMessage(token, payload) {
    const message: any = {
      subject: payload.subject,
      body: { contentType: 'HTML', content: payload.html || '' },
      toRecipients: (payload.to || []).map((address: string) => ({ emailAddress: { address } })),
      ccRecipients: (payload.cc || []).map((address: string) => ({ emailAddress: { address } })),
      bccRecipients: (payload.bcc || []).map((address: string) => ({ emailAddress: { address } })),
      attachments: (payload.attachments || []).map((file: any) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: file.filename,
        contentType: file.mime_type || 'application/octet-stream',
        contentBytes: String(file.content_base64 || '').replace(/^data:[^;]+;base64,/, ''),
      })),
    };
    await call(`${GRAPH}/me/sendMail`, token, {
      method: 'POST',
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
    return { provider_message_id: '', thread_id: '' };
  },

  async replyToMessage(token, messageId, { html, all = false, attachments = [] }) {
    const endpoint = all ? 'replyAll' : 'reply';
    const message: any = { body: { contentType: 'HTML', content: html } };
    if (attachments.length) {
      message.attachments = attachments.map((file: any) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: file.filename,
        contentType: file.mime_type || 'application/octet-stream',
        contentBytes: String(file.content_base64 || '').replace(/^data:[^;]+;base64,/, ''),
      }));
    }
    await call(`${GRAPH}/me/messages/${messageId}/${endpoint}`, token, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    return { provider_message_id: '', thread_id: '' };
  },

  async forwardMessage(token, messageId, { to, html, attachments = [] }) {
    const message: any = {
      body: { contentType: 'HTML', content: html },
      toRecipients: (to || []).map((address: string) => ({ emailAddress: { address } })),
    };
    if (attachments.length) {
      message.attachments = attachments.map((file: any) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: file.filename,
        contentType: file.mime_type || 'application/octet-stream',
        contentBytes: String(file.content_base64 || '').replace(/^data:[^;]+;base64,/, ''),
      }));
    }
    await call(`${GRAPH}/me/messages/${messageId}/forward`, token, {
      method: 'POST',
      body: JSON.stringify({ message, toRecipients: message.toRecipients }),
    });
    return { provider_message_id: '', thread_id: '' };
  },

  async modifyMessage(token, messageId, { archive, unarchive, markRead, trash }) {
    if (trash) {
      await call(`${GRAPH}/me/messages/${messageId}/move`, token, {
        method: 'POST',
        body: JSON.stringify({ destinationId: 'deleteditems' }),
      });
      return;
    }
    if (archive) {
      await call(`${GRAPH}/me/messages/${messageId}/move`, token, {
        method: 'POST',
        body: JSON.stringify({ destinationId: 'archive' }),
      });
    }
    if (unarchive) {
      await call(`${GRAPH}/me/messages/${messageId}/move`, token, {
        method: 'POST',
        body: JSON.stringify({ destinationId: 'inbox' }),
      });
    }
    if (markRead) {
      await call(`${GRAPH}/me/messages/${messageId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: true }),
      });
    }
  },

  async listCalendars(token) {
    const data = await call(`${GRAPH}/me/calendars`, token);
    return (data?.value || []).map((c: any) => ({ id: c.id, name: c.name, primary: !!c.isDefaultCalendar }));
  },

  async listEvents(token, { timeMin, timeMax, limit = 25 }) {
    const params = new URLSearchParams({
      startDateTime: timeMin,
      endDateTime: timeMax,
      $orderby: 'start/dateTime',
      $top: String(Math.min(Number(limit) || 25, 50)),
    });
    const data = await call(`${GRAPH}/me/calendarView?${params.toString()}`, token);
    return (data?.value || []).map((e: any) => ({
      provider_event_id: e.id,
      title: e.subject || '(no title)',
      description: stripHtml(e.body?.content || ''),
      location: e.location?.displayName || '',
      start_at: e.start?.dateTime ? `${e.start.dateTime}Z` : '',
      end_at: e.end?.dateTime ? `${e.end.dateTime}Z` : '',
      status: e.isCancelled ? 'cancelled' : 'confirmed',
      html_link: e.webLink || '',
      organizer_email: e.organizer?.emailAddress?.address || '',
      attendees: (e.attendees || []).map((a: any) => ({
        email: a.emailAddress?.address || '',
        name: a.emailAddress?.name || '',
        response_status: a.status?.response || '',
      })),
    }));
  },

  async availability(token, { timeMin, timeMax, attendees }) {
    const data = await call(`${GRAPH}/me/calendar/getSchedule`, token, {
      method: 'POST',
      body: JSON.stringify({
        schedules: attendees,
        startTime: { dateTime: timeMin, timeZone: 'UTC' },
        endTime: { dateTime: timeMax, timeZone: 'UTC' },
      }),
    });
    const busy = (data?.value?.[0]?.scheduleItems || []).map((slot: any) => ({
      start: slot.start?.dateTime,
      end: slot.end?.dateTime,
    }));
    return { busy };
  },

  async createEvent(token, event) {
    const created = await call(`${GRAPH}/me/events`, token, {
      method: 'POST',
      body: JSON.stringify({
        subject: event.title,
        body: { contentType: 'HTML', content: event.description || '' },
        location: { displayName: event.location || '' },
        start: { dateTime: event.start_at, timeZone: event.timezone },
        end: { dateTime: event.end_at, timeZone: event.timezone },
        attendees: (event.attendees || []).map((a: any) => ({
          emailAddress: { address: a.email },
          type: 'required',
        })),
      }),
    });
    return { provider_event_id: created.id, html_link: created.webLink || '' };
  },

  async updateEvent(token, eventId, event) {
    const body: any = {};
    if (event.title !== undefined) body.subject = event.title;
    if (event.description !== undefined) body.body = { contentType: 'HTML', content: event.description };
    if (event.location !== undefined) body.location = { displayName: event.location };
    if (event.start_at && event.end_at) {
      body.start = { dateTime: event.start_at, timeZone: event.timezone };
      body.end = { dateTime: event.end_at, timeZone: event.timezone };
    }
    if (event.attendees) {
      body.attendees = event.attendees.map((a: any) => ({ emailAddress: { address: a.email }, type: 'required' }));
    }
    await call(`${GRAPH}/me/events/${eventId}`, token, { method: 'PATCH', body: JSON.stringify(body) });
    return { provider_event_id: eventId };
  },

  async deleteEvent(token, eventId) {
    await call(`${GRAPH}/me/events/${eventId}`, token, { method: 'DELETE' });
    return { provider_event_id: eventId };
  },
};