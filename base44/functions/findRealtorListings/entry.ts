import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

async function isUrlReachable(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
  } catch { return false; }
  const tryFetch = (method) => new Promise((resolve) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    fetch(url, { method, redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } })
      .then(res => { clearTimeout(to); resolve(res ? res.status : 0); })
      .catch(() => { clearTimeout(to); resolve(0); });
  });
  let status = await tryFetch('HEAD');
  if (!status) status = await tryFetch('GET');
  if (!status) return false;
  if (status === 404 || status === 410) return false;
  return true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { salesMemberId, name, brokerage, locationLabel, lat, lng } = body;

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

    const prompt = `You are a real estate research assistant. Find ALL current and recent property listings represented by the real estate agent "${name}"${brokerage ? ` (brokerage: ${brokerage})` : ''}${area ? ` in the ${area} area` : ''}.

Search the web (Zillow, Realtor.com, Redfin, the brokerage's site, MLS portals, and the agent's own site/profile) and return every listing you can confirm belongs to THIS specific agent. Match on the agent's full name AND brokerage to avoid confusing them with another agent of the same name.

For each listing return:
- listing_address: full property address
- listing_status: "Active", "Coming Soon", "Pending", "Sold", or "Off Market"
- price: listed/sold price as a string e.g. "$450,000", or "Unknown"
- property_type: e.g. "Single Family", "Condo", "Townhouse", "Land", "Multi-Family"
- listing_url: a direct URL to THAT specific listing page that you actually found in your search results. Only include a URL you verified exists. Omit if unsure.
- has_professional_media: boolean — true if the listing has professional photos and/or a professional video tour; false if it only has agent-phone snapshots or no media.

Return up to 20 listings. Do NOT fabricate listings or URLs — only return listings you actually found for this exact agent. If you find none, return an empty list.

Return only valid JSON matching the schema.`;

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_1_pro',
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

    // Drop dead/fabricated listing URLs
    const cache = new Map();
    const reachable = async (url) => {
      if (!url || typeof url !== 'string') return false;
      const k = url.trim();
      if (!k) return false;
      if (cache.has(k)) return cache.get(k);
      const ok = await isUrlReachable(k);
      cache.set(k, ok);
      return ok;
    };
    await Promise.all(listings.map(async (l) => {
      const u = l.listing_url && String(l.listing_url).trim();
      if (u && /^https?:\/\//i.test(u) && !(await reachable(u))) {
        l.listing_url = '';
      }
    }));

    return Response.json({ listings, count: listings.length, name });
  } catch (error) {
    console.error('findRealtorListings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});