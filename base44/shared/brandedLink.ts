/**
 * Branded file links.
 *
 * Every platform-hosted file address that is shown, downloaded, copied or
 * emailed is presented on Arriv's own domain instead of a Base44/CDN address:
 *
 *     https://media.base44.com/images/public/<app>/<file>.pdf
 *        → https://app.arrivestatemedia.com/r/f3k9x2ab
 *
 * The code resolves through the ShortLink entity — the same mechanism that
 * already serves the property-access guides — and the /r/<code> route serves the
 * file on the branded page, so a Base44 address is never exposed in the
 * interface, in a download, or in the address bar.
 *
 * Only PLATFORM-hosted files are branded. Applicant-supplied Google Drive,
 * LinkedIn or portfolio addresses are the applicant's own links and are left
 * exactly as entered.
 */

export const BRANDED_LINK_BASE = (
  Deno.env.get('PUBLIC_APP_URL') || 'https://app.arrivestatemedia.com'
).replace(/\/+$/, '');

// Platform storage hosts. Anything on Arriv's own domain is already branded.
const PLATFORM_HOST = /(^|\.)base44\.com$|(^|\.)base44\.app$|(^|\.)supabase\.co$/i;

/** True when the address points at a Base44-hosted file rather than our own domain. */
export function isPlatformFileUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'arrivestatemedia.com' || host.endsWith('.arrivestatemedia.com')) return false;
    return PLATFORM_HOST.test(host);
  } catch {
    return false;
  }
}

/** Stable code per address, so the same file always resolves to the same link. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function shortCodeFor(url: string): string {
  return `f${hash(url).toString(36).padStart(7, '0')}`;
}

function labelFor(url: string): string {
  const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
  return name ? `File: ${name}` : 'Arriv file link';
}

export function brandedLinkFor(code: string): string {
  return `${BRANDED_LINK_BASE}/r/${code}`;
}

/**
 * Returns a branded link for each platform-hosted address supplied.
 * Addresses supplied by applicants are returned unchanged. Creation is
 * idempotent: an existing code for the same file is reused, never duplicated.
 */
export async function ensureBrandedLinks(
  base44: any,
  urls: (string | undefined | null)[],
): Promise<Record<string, { code: string; url: string }>> {
  const out: Record<string, { code: string; url: string }> = {};
  const unique = [...new Set((urls || []).filter((u): u is string => !!u && isPlatformFileUrl(u)))];
  if (!unique.length) return out;

  const svc = base44.asServiceRole || base44;
  const wanted = unique.map((url) => ({ url, code: shortCodeFor(url) }));
  const rows = await svc.entities.ShortLink.filter({ short_code: { $in: wanted.map((w) => w.code) } });
  const byCode = new Map<string, any>((rows || []).map((r: any) => [r.short_code, r]));

  const toCreate: any[] = [];
  for (const { url, code } of wanted) {
    const existing = byCode.get(code);
    if (existing && existing.target_url === url) {
      out[url] = { code, url: brandedLinkFor(code) };
      continue;
    }
    // A rare hash collision with a different file gets its own stable code.
    const finalCode = existing ? `${code}-${shortCodeFor(`${code}:${url}`).slice(1, 5)}` : code;
    toCreate.push({ short_code: finalCode, target_url: url, label: labelFor(url) });
    out[url] = { code: finalCode, url: brandedLinkFor(finalCode) };
  }

  if (toCreate.length) await svc.entities.ShortLink.bulkCreate(toCreate);
  return out;
}

/** Convenience for single-address callers; returns the branded link, or the address unchanged. */
export async function brandedLinkForFile(base44: any, url: string | undefined | null): Promise<string> {
  if (!url) return '';
  if (!isPlatformFileUrl(url)) return url;
  const links = await ensureBrandedLinks(base44, [url]);
  return links[url]?.url || url;
}