import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

const normalizeEmail = (e) => (e || '').toLowerCase().trim();
const digitsOnly = (p) => (p || '').replace(/\D/g, '').slice(-10);

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

CRITICAL MEDIA VERIFICATION — for EACH listing you return, you MUST perform a web search and a social media scrub to check the following before including the realtor:
1. Does the MLS / listing portal have professional photos? (only a few poor-quality / agent-phone snapshots, or no photos at all, counts as "no professional photos").
2. Has the listing agent posted any professional video walk-through, cinematic tour, drone video, or promo video for THIS property on any platform — including YouTube, Facebook, Instagram, TikTok, LinkedIn, and the brokerage's own website? Search the agent's name together with the property address on those platforms to check for property video content.

INCLUSION RULE: Include the realtor if the listing is missing professional photos, OR missing professional video, OR missing both. EXCLUDE the realtor ONLY if the listing already has BOTH professional photos AND professional video (they have no need for Arriv's services). Set "no_photo_confirmed" (true = listing has no professional photos) and "no_video_confirmed" (true = no professional video found) to reflect your findings, and use "verification_notes" to briefly note which platforms you checked.

SOCIAL MEDIA DISCOVERY — while scrubbing, also collect any professional social media profile links for the agent (e.g. their YouTube channel, Facebook business page, Instagram profile, TikTok, LinkedIn profile, brokerage profile page, or personal agent website). Return these as "social_media_links" (array of URL strings). These help the sales rep research the realtor before reaching out.

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
- no_photo_confirmed: boolean — true if you confirmed the listing has no professional photos
- no_video_confirmed: boolean — true if you confirmed no professional video exists on social media / web
- verification_notes: short string summarizing what you checked (e.g. "Checked MLS, YouTube, Instagram, agent website — no pro photo or video found")
- website: the agent's primary website URL (their personal agent site or brokerage profile page) if found, otherwise "Not found"
- social_media_links: array of URL strings for the agent's professional social media profiles found during the scrub (empty array if none found)
- call_script: a short, friendly cold-call script (3-5 sentences) personalized to this realtor and this specific listing. It should mention that their listing at the address appears to be missing professional photos and/or video, introduce Arriv Estate Media's photography & videography services, and ask for a brief conversation or a quick quote. Keep it natural and conversational.

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
    realtors.sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999));

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