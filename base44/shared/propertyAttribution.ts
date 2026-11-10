// Campaign and referrer attribution for the public property surfaces.
//
// Nothing here creates a cookie, a device identifier or any persistent client-side marker. An
// attribution record is built only from what the visitor's own request already carries: the
// campaign parameters in the page URL and the browser's Referer header. Both are reduced to short,
// storable values, and a referring URL is cut down to its hostname so a query string that might
// carry personal data never reaches the database.

export const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export const ATTRIBUTION_MAX = 80;

export type AttributionChannel = "paid" | "social" | "organic" | "referral" | "internal" | "direct";

export interface Attribution {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  referrer_host: string;
  landing_page: string;
  channel: AttributionChannel;
}

const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|startpage|qwant|search\.aol)\.[a-z.]{2,}$/;
const SOCIAL_HOSTS = /(^|\.)(facebook|fb|instagram|tiktok|linkedin|lnkd|twitter|x|pinterest|youtube|youtu|reddit|threads|nextdoor)\.[a-z.]{2,}$/;
const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paid_search", "paid_social", "display", "banner", "retargeting", "sponsored"]);
const PAID_SOURCES = new Set(["googleads", "google_ads", "adwords", "facebook_ads", "meta_ads", "instagram_ads", "bing_ads", "tiktok_ads"]);
const CLICK_IDS = ["gclid", "gclsrc", "fbclid", "msclkid", "ttclid", "li_fat_id"];

function clean(value: unknown, max = ATTRIBUTION_MAX): string {
  return String(value ?? "")
    // Control characters are stripped before truncation so a crafted value cannot smuggle anything
    // into a stored field or an email header.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .toLowerCase()
    .slice(0, max);
}

export function referrerHost(referrer: unknown): string {
  try {
    return new URL(String(referrer || "")).hostname.replace(/^www\./, "").toLowerCase().slice(0, 120);
  } catch {
    return "";
  }
}

// The path only. A query string is deliberately dropped: it can carry the visitor's own search
// terms, an email address in a click-tracking parameter, or a session token.
export function pathOnly(url: unknown): string {
  try {
    return new URL(String(url || "")).pathname.slice(0, 200);
  } catch {
    return "";
  }
}

export function normalizeAttribution(input: any = {}, ownHosts: string[] = []): Attribution {
  const source = clean(input?.utm_source);
  const medium = clean(input?.utm_medium);
  const campaign = clean(input?.utm_campaign);
  const content = clean(input?.utm_content);
  const term = clean(input?.utm_term);
  const referrer = referrerHost(input?.referrer || input?.referrer_url || "");
  const landing = pathOnly(input?.landing_page || "");

  const hasClickId = CLICK_IDS.some((key) => clean(input?.[key]).length > 0);
  const own = ownHosts.map((host) => String(host || "").toLowerCase()).filter(Boolean);

  let channel: AttributionChannel = "direct";
  if (PAID_MEDIUMS.has(medium) || PAID_SOURCES.has(source) || hasClickId) {
    channel = "paid";
  } else if (SOCIAL_HOSTS.test(source) || SOCIAL_HOSTS.test(referrer)) {
    channel = "social";
  } else if (SEARCH_HOSTS.test(referrer)) {
    channel = "organic";
  } else if (own.some((host) => referrer === host || referrer.endsWith(`.${host}`))) {
    channel = "internal";
  } else if (referrer) {
    channel = "referral";
  }

  return {
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_content: content,
    utm_term: term,
    referrer_host: referrer,
    landing_page: landing,
    channel,
  };
}

// The label a person reads on a lead: the campaign if there is one, otherwise the channel.
export function attributionLabel(attribution: Partial<Attribution> | null | undefined): string {
  if (!attribution) return "Direct visit";
  const source = String(attribution.utm_source || "");
  const campaign = String(attribution.utm_campaign || "");
  const channel = String(attribution.channel || "direct");
  if (source && campaign) return `${source} / ${campaign}`;
  if (source) return source;
  if (attribution.referrer_host) return attribution.referrer_host;
  return channel === "direct" ? "Direct visit" : channel.replace(/_/g, " ");
}

// Bots and link-preview fetchers are not visitors. Excluded before any view is counted, so paid and
// social unfurls do not inflate a property's reporting.
const BOT_PATTERN = /(bot|crawler|spider|crawling|preview|headless|phantom|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|embedly|quora link preview|pinterest\/|vkshare|w3c_validator|lighthouse|pingdom|uptime)/i;

export function looksAutomated(userAgent: unknown): boolean {
  const ua = String(userAgent || "");
  if (!ua) return true;
  return BOT_PATTERN.test(ua);
}

// Calendar day in the business timezone, so a day's figures match the operator's own day.
export function operatingDay(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

export function trafficBucketKey(listingId: string, day: string, channel: string): string {
  return `${String(listingId || "")}|${String(day || "")}|${String(channel || "direct")}`;
}