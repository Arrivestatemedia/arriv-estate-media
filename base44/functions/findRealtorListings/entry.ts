import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// Returns the HTTP status code for a URL (0 if the request failed entirely).
// We only use this to drop definitively-dead links (404/410); a connection
// failure (bot-blocked HEAD/GET, timeout) does NOT count as dead, since most
// real-estate portals block bot requests but still load fine in a real browser.
async function getUrlStatus(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return 0;
  } catch { return 0; }
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 1200);
  return await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } })
    .then(res => { clearTimeout(to); return res ? res.status : 0; })
    .catch(() => { clearTimeout(to); return 0; });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { salesMemberId, name, brokerage, locationLabel, lat, lng, exclude, limit } = body;
    const maxListings = Math.min(Number(limit) || 4, 10);
    const excludeList = Array.isArray(exclude)
      ? exclude.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];

    if (!name || !name.trim()) {
      return Response.json({ error: 'Agent name is required' }, { status: 400 });
    }

    // Light auth check (matches findProspectingRealtors)
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

    const area = locationLabel && locationLabel.trim()
      ? locationLabel.trim()
      : (lat != null && lng != null ? `latitude ${lat}, longitude ${lng}` : '');

    const excludeClause = excludeList.length
      ? `\nEXCLUDE these addresses already found (return DIFFERENT listings, not these): ${excludeList.map((a) => `"${a}"`).join(', ')}.`
      : '';

    const prompt = `List property listings represented by real estate agent "${name}"${brokerage ? ` (${brokerage})` : ''}${area ? ` near ${area}` : ''}. Match on the agent's full name AND brokerage to avoid same-name confusion.

SPEED: Do exactly ONE web search (e.g. "${name}" ${brokerage || ''} active listings). Do NOT open individual listing pages — read only the search-result snippets. Return up to ${maxListings} listings for THIS agent.${excludeClause} For each listing, extract every detail visible in the search-result snippet:
- listing_address
- listing_status (Active/Coming Soon/Pending/Sold/Off Market)
- price (e.g. "$450,000" or "Unknown")
- property_type
- beds (number, or null if not shown)
- baths (number, or null if not shown)
- sqft (integer, or null if not shown)
- description (one short sentence/phrase summarizing the listing from the snippet; "" if none)
- photo_url (a thumbnail image URL for the listing if one is visible in the snippet; "" if none)
- listing_url (MUST be the DIRECT property-detail page URL for THIS specific listing — e.g. the exact Zillow/Realtor.com/Redfin/Trulia/Homes.com/ brokerage property URL, which always contains the property's street number and street name in the URL path). Do NOT use a generic city/state search-results page, an agent's listings page, or a homepage. If you cannot find a direct property-detail URL that contains this listing's street address in the path, leave listing_url EMPTY — do not guess or substitute a generic URL.
Only include has_professional_media if it is explicitly visible in a snippet; otherwise omit it. Do not fabricate listings, URLs, numbers, or photos — if a field isn't in the snippet, leave it empty/null. Return only valid JSON.`;

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          listings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                listing_address: { type: 'string' },
                listing_status: { type: 'string' },
                price: { type: 'string' },
                property_type: { type: 'string' },
                beds: { type: ['integer', 'null'] },
                baths: { type: ['integer', 'null'] },
                sqft: { type: ['integer', 'null'] },
                description: { type: 'string' },
                photo_url: { type: 'string' },
                listing_url: { type: 'string' },
                has_professional_media: { type: 'boolean' }
              },
              required: ['listing_address', 'listing_status']
            }
          }
        },
        required: ['listings']
      }
    });

    let listings = (llmRes && llmRes.listings) ? llmRes.listings : [];

    // Only show listings a realtor could still need media for: Active and
    // Coming Soon. Drop Sold, Off Market, Pending, Closed, Withdrawn, Expired,
    // Contingent, etc.
    listings = listings.filter((l) => {
      const s = String(l.listing_status || '').toLowerCase();
      return /active|coming\s*soon/i.test(s);
    });

    // Verify each listing_url actually corresponds to THIS property: all major
    // portals (Zillow, Realtor.com, Redfin, Trulia, Homes.com, brokerages) embed
    // the property's street number + street name in the URL path. A correct
    // property-detail URL MUST contain this listing's street number (as a whole
    // path token) AND at least one street-name token. This drops LLM-returned
    // links that point to a generic city search page or a DIFFERENT property.
    const urlAddressMatches = (url, addr) => {
      try {
        const u = String(url || '').toLowerCase();
        if (!u || u.includes('not found')) return false;
        // Reject search-results / listing-LIST pages (not a specific property detail)
        const searchIndicators = ['_rb', 'searchquerystate', '/search', '?query=', '&query=', '/for_sale', '/for-sale', '/for_rent', '/for-rent', '/recentlysold', '/recently_sold', '/sold', 'hasphoto', 'mapresults', '/listings/', '/agents/', '/realtor/'];
        if (searchIndicators.some(s => u.includes(s))) return false;
        // Zillow: /homes/... is search results; /homedetails/... is a property detail page
        if (u.includes('/homes/') && !u.includes('/homedetails/')) return false;
        const street = String(addr || '').toLowerCase().split(',')[0].trim();
        const number = (street.match(/\d+/) || [])[0] || '';
        const toks = street.split(/[^a-z0-9]+/).filter(t => t.length >= 3);
        const pathTokens = u.split(/[^a-z0-9]+/).filter(Boolean);
        const hasNumber = number && pathTokens.includes(number);
        const hasName = toks.length === 0 ? true : toks.some(t => pathTokens.some(pt => pt.includes(t)));
        return !!(hasNumber && hasName);
      } catch { return false; }
    };
    listings = listings.map((l) => {
      const u = l.listing_url && String(l.listing_url).trim();
      if (!u || !/^https?:\/\//i.test(u)) { l.listing_url = ''; return l; }
      if (!urlAddressMatches(u, l.listing_address)) l.listing_url = '';
      return l;
    });

    // Drop only definitively-dead listing URLs (404/410). A connection failure
    // (bot-blocked request/timeout) is NOT enough to strip — the page often
    // loads fine in a real browser, so we keep the URL and let the user open it.
    const statusCache = new Map();
    const statusOf = async (url) => {
      if (!url || typeof url !== 'string') return 0;
      const k = url.trim();
      if (!k) return 0;
      if (statusCache.has(k)) return statusCache.get(k);
      const s = await getUrlStatus(k);
      statusCache.set(k, s);
      return s;
    };
    await Promise.all(listings.map(async (l) => {
      const u = l.listing_url && String(l.listing_url).trim();
      if (u && /^https?:\/\//i.test(u)) {
        const s = await statusOf(u);
        if (s === 404 || s === 410) l.listing_url = '';
      }
    }));

    return Response.json({ listings, count: listings.length, name });
  } catch (error) {
    console.error('findRealtorListings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});