import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
        // Lookup failures shouldn't block prospecting (e.g. transient issues); proceed.
        console.warn('Sales member lookup failed, proceeding:', e?.message);
      }
    }

    const areaLabel = locationLabel && locationLabel.trim()
      ? locationLabel.trim()
      : `latitude ${lat}, longitude ${lng}`;

    const prompt = `You are a real estate media sales prospecting assistant for "Arriv Estate Media", a professional property photography & videography company.

GOAL: Find real estate agents (realtors) near ${areaLabel} (within ${radius} miles — center coordinates lat ${lat}, lng ${lng}) who currently have property listings that are "Active" or "Coming Soon" and that DO NOT have professional photos and/or video media associated with the listing. We are looking for listings with no photos, only a few poor-quality photos, or no video — these are prime prospects for media services.
${minP != null || maxP != null ? `PRICE FILTER: Only include listings whose listed price is between ${minP != null ? '$' + minP.toLocaleString() : 'no min'} and ${maxP != null ? '$' + maxP.toLocaleString() : 'no max'}. If a listing's price is outside this range, skip it.` : ''}
${kw ? `KEYWORD FOCUS: Prioritize listings/realtors matching these keywords: "${kw}". For example: property types (e.g. "new construction", "luxury", "condo"), neighborhoods, or agent specialties.` : ''}

For EACH realtor, gather:
- name: full name of the listing agent
- brokerage: their brokerage / company
- email: best contact email (use "Not found" if unavailable)
- phone: best phone number, preferably mobile/office (E.164 +1 format if possible; "Not found" if unavailable)
- distance_miles: approximate distance in miles from the center location
- listing_address: the property address that lacks media
- listing_status: "Active" or "Coming Soon"
- price: listed price if known (e.g. "$450,000") or "Unknown"
- call_script: a short, friendly cold-call script (3-5 sentences) personalized to this realtor and this specific listing. It should mention that their listing at the address appears to lack professional media, introduce Arriv Estate Media's photography & videography services, and ask for a brief conversation or a quick quote. Keep it natural and conversational.

Return up to 25 realtors for page ${page}. Prioritize REAL, verifiable realtors and listings near the location. Do NOT fabricate people or listings — if you cannot find 25, return fewer. For page > 1, return a DIFFERENT set of realtors than earlier pages (skip ones already covered).

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
                listing_status: { type: 'string' },
                price: { type: 'string' },
                call_script: { type: 'string' }
              },
              required: ['name', 'listing_address', 'call_script']
            }
          }
        },
        required: ['realtors']
      }
    });

    const realtors = (llmRes && llmRes.realtors) ? llmRes.realtors : [];

    // Sort by distance ascending so closest show first
    realtors.sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999));

    return Response.json({ realtors, page, count: realtors.length, locationLabel: areaLabel });
  } catch (error) {
    console.error('findProspectingRealtors error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});