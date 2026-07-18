import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

const normalizeEmail = (e) => (e || '').toLowerCase().trim();
const digitsOnly = (p) => (p || '').replace(/\D/g, '').slice(-10);

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// Verify a URL actually resolves (drops fabricated / 404 links) while keeping
// login-walled social profiles (401/403) that are still real pages.
async function isUrlReachable(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
  } catch { return false; }
  const tryFetch = (method) => new Promise((resolve) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 3500);
    fetch(url, { method, redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } })
      .then(res => { clearTimeout(to); resolve(res ? res.status : 0); })
      .catch(() => { clearTimeout(to); resolve(0); });
  });
  let status = await tryFetch('HEAD');
  if (!status) status = await tryFetch('GET');
  if (!status) return false;                 // network / DNS / timeout → dead
  if (status === 404 || status === 410) return false;  // page does not exist
  return true;
}

// Fetch page text (for ownership verification). Returns null if unreachable/undecodable.
async function fetchPageText(url) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } });
    clearTimeout(to);
    if (!res || !res.ok) return null;
    const buf = await res.text();
    return buf ? buf : null;
  } catch { return null; }
}

const NAME_STOP = new Set(['agent','realtors','realtor','realty','estate','real','properties','group','the','and','llc','inc','team','homes','realestate','buyers','seller','sales','assoc','associates','brokerage','broker']);
const nameTokens = (name) => (name || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !NAME_STOP.has(t));

// Confirm a website belongs to THIS agent (not a generic brokerage homepage).
async function verifyWebsiteOwned(url, agentName) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname.toLowerCase();
    const tokens = nameTokens(agentName);
    const bigRoots = ['exprealty.com','kw.com','remax.com','compass.com','coldwellbanker.com','century21.com','zillow.com','realtor.com','redfin.com','sothebysrealty.com','homes.com','trulia.com','homesnap.com','estately.com'];
    const isBigRoot = bigRoots.some(d => host === d || host.endsWith('.' + d));
    if (isBigRoot && (path === '/' || path === '' || path.length < 4)) return false;
    if (tokens.some(t => path.includes(t))) return true;
    const text = await fetchPageText(url);
    if (!text) {
      // Couldn't fetch (e.g. bot-blocked) — trust only if the domain itself contains an agent name token
      return tokens.some(t => host.includes(t));
    }
    const low = text.toLowerCase();
    const last = tokens.length ? tokens[tokens.length - 1] : '';
    const first = tokens.length ? tokens[0] : '';
    if (last && low.includes(last)) return true;
    if (first && low.includes(first)) return true;
    return false;
  } catch { return false; }
}

// Reject non-profile social URLs (homepages, search/hashtag/post pages) that don't represent a specific person.
function looksLikeSocialProfile(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname.toLowerCase();
    const socialDomains = ['instagram.com','facebook.com','tiktok.com','youtube.com','youtu.be','linkedin.com','x.com','twitter.com','linktr.ee','pinterest.com'];
    const isSocial = socialDomains.some(d => host === d || host.endsWith('.' + d));
    if (!isSocial) return true;
    if (path === '/' || path === '') return false;
    if (/\/(search|hashtag|explore|directory|p\/|posts|reel|reels|watch)\b/.test(path)) return false;
    if (/[/?]search\b/.test(u.href.toLowerCase())) return false;
    if (host.endsWith('linkedin.com') && !path.startsWith('/in/')) return false;
    if (host.endsWith('facebook.com') && /\/(groups|marketplace|pages)\b/.test(path)) return false;
    return true;
  } catch { return false; }
}

// Parse a price string like "$1,250,000" or "1250000" into a number (0 if unknown).
const priceToNumber = (p) => {
  if (!p) return 0;
  const s = String(p).replace(/[^0-9.]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { salesMemberId, lat, lng, locationLabel, radiusMiles = 100, page = 1, keywords = '', minPrice, maxPrice } = body;

    const radius = Math.max(5, Math.min(500, Number(radiusMiles) || 100));
    const kw = (keywords || '').trim();
    const minP = minPrice != null && minPrice !== '' && !isNaN(Number(minPrice)) ? Number(minPrice) : null;
    const maxP = maxPrice != null && maxPrice !== '' && !isNaN(Number(maxPrice)) ? Number(maxPrice) : null;

    if (lat == null || lng == null) {
      return Response.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    // Verify the sales team member (light auth, matches existing sales functions)
    if (salesMemberId) {
      try {
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
        if (!members || members.length === 0) {
          return Response.json({ error: 'Sales member not found' }, { status: 404 });
        }
      } catch (e) {
        console.warn('Sales member lookup failed, proceeding:', e?.message);
      }
    }

    const areaLabel = locationLabel && locationLabel.trim()
      ? locationLabel.trim()
      : `latitude ${lat}, longitude ${lng}`;

    const prompt = `You are a real estate media sales prospecting assistant for "Arriv Estate Media", a professional property photography & videography company.

GOAL: Find real estate agents (realtors) near ${areaLabel} (within ${radius} miles — center coordinates lat ${lat}, lng ${lng}) who currently have property listings that are "Active" or "Coming Soon" and that are missing professional media — meaning the listing has NO professional photos, OR NO professional video, OR BOTH. Any one of these gaps makes them a prospect for Arriv's photography & videography services.

HARD STATUS RULE — ABSOLUTE REQUIREMENT: You may ONLY include listings whose current status is exactly "Active" (on the market / for sale) or "Coming Soon". You MUST EXCLUDE any listing that is Off Market, Sold, Pending, Contingent, Under Contract, Withdrawn, Expired, or "Closed". Before including a listing, confirm on the source page (Zillow / Realtor.com / Redfin / Homes.com / brokerage site) that it is currently labeled Active or Coming Soon. If the listing shows as Sold, Pending, Under Contract, Off Market, or any past-closed status, DO NOT include that realtor for that listing — skip it entirely and find a different one. There is one strict test: the listing URL you return MUST currently show the property as Active or Coming Soon when opened. If it does not, that listing is invalid.

CRITICAL MEDIA VERIFICATION — for EACH listing you return, you MUST perform a web search and a social media scrub to check the following before including the realtor:
1. Does the MLS / listing portal have professional photos? (only a few poor-quality / agent-phone snapshots, or no photos at all, counts as "no professional photos").
2. Has the listing agent posted any professional video walk-through, cinematic tour, drone video, or promo video for THIS property on any platform — including YouTube, Facebook, Instagram, TikTok, LinkedIn, and the brokerage's own website? Search the agent's name together with the property address on those platforms to check for property video content.

INCLUSION RULE: Include the realtor if the listing is missing professional photos, OR missing professional video, OR missing both. EXCLUDE the realtor ONLY if the listing already has BOTH professional photos AND professional video (they have no need for Arriv's services). Set "no_photo_confirmed" (true = listing has no professional photos) and "no_video_confirmed" (true = no professional video found) to reflect your findings, and use "verification_notes" to briefly note which platforms you checked.

SOCIAL MEDIA DISCOVERY — while scrubbing, also collect this agent's OWN professional social media profile links. ONLY return profile pages that belong to THIS specific agent: their personal YouTube channel, their Facebook business/page profile, their Instagram profile, their TikTok profile, their personal LinkedIn profile (/in/...), or their personal agent website / direct brokerage bio page. Do NOT return: the brokerage's company Facebook/LinkedIn page, search-results URLs, hashtag pages, individual posts or reels, directory/lead-capture pages, or any profile whose display name does not match this agent. Every link must take the user directly to that agent's profile page. Return these as "social_media_links" (array of URL strings). It is far better to return an empty array than a wrong or generic link.

ACCURACY REQUIREMENT — CRITICAL: Only include a social_media_links entry OR a website URL if you actually found it in your web search results AND it clearly belongs to THIS specific agent. For each link, open/verify in your search that the page exists and features THIS agent (the profile display name or page title matches the agent's name or their brokerage). Do NOT guess, construct, or fabricate URLs. Do NOT return a brokerage company homepage as the agent's "website". Do NOT return a company-wide social page as the agent's profile. If you cannot confirm a link is real and belongs to this exact agent, OMIT it entirely — do not include it. Every link must be a complete, well-formed https:// URL that opens directly to that agent's profile/page. Returning zero links is strongly preferred over returning a wrong, generic, or broken link.

${minP != null || maxP != null ? `PRICE FILTER: Only include listings whose listed price is between ${minP != null ? '$' + minP.toLocaleString() : 'no min'} and ${maxP != null ? '$' + maxP.toLocaleString() : 'no max'}. If a listing's price is outside this range, skip it.` : ''}
${kw ? `KEYWORD FOCUS: Prioritize listings/realtors matching these keywords: "${kw}". For example: property types (e.g. "new construction", "luxury", "condo"), neighborhoods, or agent specialties.` : ''}
PRICE RANGE — MANDATORY COVERAGE: You MUST include qualifying listings across the FULL price spectrum in the area, not just the top of the market. Explicitly search for and include listings at every price tier: luxury ($1M+), mid-tier ($600K–$1M), and especially entry-level / affordable homes priced as low as $300,000. Do NOT focus only on the most expensive listings — affordable listings under $500K (down to ~$300K) are equally valuable prospects and MUST be represented in your results. Aim for a balanced mix of price points in the first page of results, ordered highest price first but including the lower-priced homes too.

For EACH realtor, gather:
- name: full name of the listing agent
- brokerage: their brokerage / company
- email: best contact email (use "Not found" if unavailable)
- phone: best phone number, preferably mobile/office (E.164 +1 format if possible; "Not found" if unavailable)
- distance_miles: approximate distance in miles from the center location
- listing_address: the property address that lacks media
- listing_status: "Active" or "Coming Soon" (MUST be one of these two; never Sold/Pending/Off Market)
- price: listed price if known (e.g. "$450,000") or "Unknown"
- listing_url: THE EXACT source URL you used to find THIS listing's data — the direct property detail page on Zillow, Realtor.com, Redfin, Homes.com, or the brokerage's own property detail page that you actually visited and read. This URL MUST be the page that shows THIS property (matching the listing_address), MUST currently display the property as Active or Coming Soon, and clicking it MUST open the correct listing (not a different property, not a search-results page, not the agent's homepage). If you cannot find a direct detail URL for THIS property, return "Not found" — never guess or construct a URL. This is the link the sales rep will click to view the listing, so it must be the precise page you sourced the data from.
- no_photo_confirmed: boolean — true if you confirmed the listing has no professional photos
- no_video_confirmed: boolean — true if you confirmed no professional video exists on social media / web
- verification_notes: short string summarizing what you checked (e.g. "Checked MLS, YouTube, Instagram, agent website — no pro photo or video found")
- website: the agent's PERSONAL website (e.g. janedoe.realtor) OR their DIRECT personal profile/bio/listings page on a brokerage site (a URL whose path includes their name and which shows THIS agent's photo, bio, and listings). Do NOT return the brokerage's generic homepage (e.g. https://www.exprealty.com/, https://www.kw.com/, https://www.remax.com/) — that is NOT this agent's page. If you cannot find a page that directly features this specific agent, return "Not found".
- social_media_links: array of URL strings for the agent's professional social media profiles found during the scrub (empty array if none found)
- call_script: a short, friendly cold-call opener (1-2 sentences) personalized to this realtor and this listing — mention their listing appears to be missing professional photos/video, introduce Arriv Estate Media, and ask for a quick quote. Keep it natural and brief.

Return up to 8 realtors for page ${page}. Prioritize REAL, verifiable realtors and listings near the location. Do NOT fabricate people or listings — if you cannot find 8, return fewer. For page > 1, return a DIFFERENT set of realtors than earlier pages (skip ones already covered). Be efficient with your web searches — do not over-search for any single listing.

Return only valid JSON matching the schema.`;

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          realtors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                brokerage: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                distance_miles: { type: 'number' },
                listing_address: { type: 'string' },
                listing_status: { type: 'string', enum: ['Active', 'Coming Soon'] },
                price: { type: 'string' },
                listing_url: { type: 'string' },
                no_photo_confirmed: { type: 'boolean' },
                no_video_confirmed: { type: 'boolean' },
                verification_notes: { type: 'string' },
                website: { type: 'string' },
                social_media_links: { type: 'array', items: { type: 'string' } },
                call_script: { type: 'string' }
              },
              required: ['name', 'listing_address', 'call_script']
            }
          }
        },
        required: ['realtors']
      }
    });

    let realtors = (llmRes && llmRes.realtors) ? llmRes.realtors : [];

    // ── Verify website + social links are real AND belong to this agent ──
    const urlCache = new Map();
    const checkReachable = async (url) => {
      if (!url || typeof url !== 'string') return false;
      const key = url.trim();
      if (!key) return false;
      if (urlCache.has(key)) return urlCache.get(key);
      const ok = await isUrlReachable(key);
      urlCache.set(key, ok);
      return ok;
    };
    await Promise.all(realtors.map(async (r) => {
      const site = r.website && !String(r.website).toLowerCase().includes('not found') ? String(r.website).trim() : '';
      const rawLinks = Array.isArray(r.social_media_links) ? r.social_media_links.filter(Boolean).map(l => String(l).trim()) : [];
      const seen = new Set();
      const uniqLinks = [];
      for (const l of rawLinks) { if (!seen.has(l)) { seen.add(l); uniqLinks.push(l); } }
      const profileLinks = uniqLinks.filter(looksLikeSocialProfile);
      // Run website ownership check + all social reachability checks in parallel (big speedup)
      const [siteOk, ...linkOks] = await Promise.all([
        site ? verifyWebsiteOwned(site, r.name) : Promise.resolve(false),
        ...profileLinks.map(l => checkReachable(l))
      ]);
      r.website = site && siteOk ? site : '';
      r.social_media_links = profileLinks.filter((_, i) => linkOks[i]);
    }));

    // ── Enforce Active/Coming-Soon status + verify the listing source URL matches THIS property ──
    const VALID_STATUS = new Set(['active', 'coming soon', 'comingsoon', 'coming-soon', 'new', 'new listing']);
    // All major portals (Zillow, Realtor.com, Redfin, Trulia, Homes.com, brokerages) embed the
    // property's street number + street name in the URL path. A correct listing_url MUST contain
    // this listing's street number (as a whole path token) AND at least one street-name token.
    // This catches LLM-hallucinated links that point to a real but DIFFERENT property.
    const urlAddressMatches = (url, addr) => {
      try {
        const u = String(url || '').toLowerCase();
        if (!u || u.includes('not found')) return false;
        const street = String(addr || '').toLowerCase().split(',')[0].trim();
        const number = (street.match(/\d+/) || [])[0] || '';
        const toks = street.split(/[^a-z0-9]+/).filter(t => t.length >= 3);
        const pathTokens = u.split(/[^a-z0-9]+/).filter(Boolean);
        const hasNumber = number && pathTokens.includes(number);
        const hasName = toks.length === 0 ? true : toks.some(t => pathTokens.some(pt => pt.includes(t)));
        return !!(hasNumber && hasName);
      } catch { return false; }
    };
    realtors = realtors.map(r => {
      const statusRaw = String(r.listing_status || '').toLowerCase().trim();
      const statusOk = VALID_STATUS.has(statusRaw);
      const urlOk = urlAddressMatches(r.listing_url, r.listing_address);
      return { ...r, _status_ok: statusOk, _url_ok: urlOk };
    });

    // Drop listings that are off-market/sold, or whose source URL doesn't match this property
    // (the rep needs a working "View Listing" link to the CORRECT property)
    realtors = realtors.filter(r => r._status_ok && r._url_ok).map(r => {
      delete r._status_ok;
      delete r._url_ok;
      return r;
    });

    // Prioritize highest-priced listings first (homes in the millions), then by distance.
    realtors.sort((a, b) => {
      const pd = priceToNumber(b.price) - priceToNumber(a.price);
      if (pd !== 0) return pd;
      return (a.distance_miles ?? 999) - (b.distance_miles ?? 999);
    });

    // ── Match each realtor against the local Contact database ──────────
    let ownerNameMap = {};
    let contactsList = [];
    try {
      contactsList = await base44.asServiceRole.entities.Contact.list('-created_date', 5000);
      const ownerIds = [...new Set(contactsList.map(c => c.owner_id).filter(Boolean))];
      if (ownerIds.length > 0) {
        const members = await base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500);
        for (const m of members) {
          ownerNameMap[m.id] = m.full_name || m.email || '';
        }
      }
    } catch (e) {
      console.warn('Contact/owner lookup failed, skipping DB matching:', e?.message);
    }

    const byEmail = {};
    const byPhone = [];
    for (const c of contactsList) {
      if (c.email) byEmail[normalizeEmail(c.email)] = c;
      if (c.phone) byPhone.push({ digits: digitsOnly(c.phone), c });
    }

    realtors = realtors.map(r => {
      const rEmail = normalizeEmail(r.email);
      const rDigits = digitsOnly(r.phone);
      let match = null;
      if (rEmail && rEmail !== 'notfound' && byEmail[rEmail]) match = byEmail[rEmail];
      if (!match && rDigits.length >= 10) {
        match = byPhone.find(p => p.digits === rDigits)?.c || null;
      }
      if (!match) {
        return { ...r, db_exists: false, owner_id: '', owner_name: '', contact_id: '', owned_by_me: false };
      }
      const ownerName = match.owner_id ? (ownerNameMap[match.owner_id] || 'Unknown') : '';
      return {
        ...r,
        db_exists: true,
        contact_id: match.id,
        owner_id: match.owner_id || '',
        owner_name: ownerName,
        owned_by_me: match.owner_id === salesMemberId
      };
    });

    return Response.json({ realtors, page, count: realtors.length, locationLabel: areaLabel });
  } catch (error) {
    console.error('findProspectingRealtors error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});