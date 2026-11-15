/**
 * RFC 2822 message builder.
 *
 * Gmail's API requires a complete MIME message, so headers are built here rather
 * than concatenated at each call site. Non-ASCII subjects are RFC 2047 encoded
 * and attachments are base64 encoded as proper MIME parts.
 */

const CRLF = '\r\n';

function encodeHeader(value: string) {
  const text = String(value ?? '');
  // RFC 2047 encoded-word for anything outside plain ASCII.
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(text)))}?=`;
}

function base64Lines(base64: string) {
  return (base64.match(/.{1,76}/g) || []).join(CRLF);
}

export interface MimeAttachment {
  filename: string;
  mime_type?: string;
  content_base64: string;
}

export interface MimeMessage {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: MimeAttachment[];
}

export function buildMime(message: MimeMessage) {
  const boundary = `arriv_${crypto.randomUUID().replace(/-/g, '')}`;
  const headers = [
    `From: ${message.from}`,
    `To: ${(message.to || []).join(', ')}`,
    ...(message.cc?.length ? [`Cc: ${message.cc.join(', ')}`] : []),
    ...(message.bcc?.length ? [`Bcc: ${message.bcc.join(', ')}`] : []),
    `Subject: ${encodeHeader(message.subject)}`,
    'MIME-Version: 1.0',
    ...(message.inReplyTo ? [`In-Reply-To: ${message.inReplyTo}`] : []),
    ...(message.references ? [`References: ${message.references}`] : []),
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const parts: string[] = [];
  parts.push(
    `--${boundary}${CRLF}Content-Type: multipart/alternative; boundary="${boundary}_alt"${CRLF}${CRLF}` +
      `--${boundary}_alt${CRLF}Content-Type: text/plain; charset=UTF-8${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}` +
      `${base64Lines(btoa(unescape(encodeURIComponent(message.text || stripHtml(message.html)))))}${CRLF}` +
      `--${boundary}_alt${CRLF}Content-Type: text/html; charset=UTF-8${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}` +
      `${base64Lines(btoa(unescape(encodeURIComponent(message.html || ''))))}${CRLF}` +
      `--${boundary}_alt--${CRLF}`
  );

  for (const file of message.attachments || []) {
    const clean = String(file.content_base64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!clean || !file.filename) continue;
    parts.push(
      `--${boundary}${CRLF}Content-Type: ${file.mime_type || 'application/octet-stream'}; name="${file.filename}"${CRLF}` +
        `Content-Transfer-Encoding: base64${CRLF}` +
        `Content-Disposition: attachment; filename="${file.filename}"${CRLF}${CRLF}` +
        `${base64Lines(clean)}${CRLF}`
    );
  }
  parts.push(`--${boundary}--${CRLF}`);

  return `${headers.join(CRLF)}${CRLF}${CRLF}${parts.join('')}`;
}

export function stripHtml(html: string) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Gmail wants base64url with no padding. */
export function toGmailRaw(mime: string) {
  return btoa(unescape(encodeURIComponent(mime)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}