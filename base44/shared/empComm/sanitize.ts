/**
 * Sanitises inbound HTML before it is stored or shown.
 *
 * Email HTML is untrusted input. Scripts, event handlers, frames and remote
 * styles are removed so a message body can never run code inside Arriv One.
 */

const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'div', 'em', 'font', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub',
  'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);

export function sanitizeEmailHtml(input: string) {
  let html = String(input || '');

  // Whole elements that can execute or embed.
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<(iframe|object|embed|form|input|button|textarea|select|link|meta)[\s\S]*?>/gi, '');
  html = html.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, '');

  // Event handlers and javascript: URLs.
  html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  html = html.replace(/javascript:/gi, '');
  html = html.replace(/\sstyle\s*=\s*"[^"]*expression[^"]*"/gi, '');
  html = html.replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*')/gi, '');

  // Drop any tag that is not on the allow list, keeping its inner text.
  html = html.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (match, rawName, rest) => {
    const name = String(rawName).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    return match;
  });

  // Links open in a new tab and never carry a referrer back.
  html = html.replace(/<a\s([^>]*)>/gi, (match, attrs) => {
    const cleaned = String(attrs)
      .replace(/\s(href)\s*=\s*'([^']*)'/gi, ' $1="$2"')
      .replace(/\starget\s*=\s*("[^"]*"|'[^']*')/gi, '');
    return `<a ${cleaned} target="_blank" rel="noopener noreferrer nofollow">`;
  });

  return html;
}