import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { rowsOf, jsonResponse, CORS_HEADERS } from '../../shared/visibilityActor.ts';
import { readVisibilitySwitches } from '../../shared/visibilitySwitches.ts';
import { isPubliclyVisible, profilePath, normalizeSlug, PROFILE_DISCLOSURES } from '../../shared/professionalProfile.ts';
import { marketTitle, marketPath, marketSeoPayload } from '../../shared/professionalSeo.ts';
import { marketQuery, evaluateMarket, marketIndexable, marketSlugFor } from '../../shared/geoMarkets.ts';
import { loadRankedDirectory } from '../../shared/propertyDirectoryRanking.ts';
import { rankProfessionals, publicDirectoryCard } from '../../shared/professionalRanking.ts';
import { publicOrigin } from '../../shared/propertyVisibility.ts';

function listingCard(listing) {
  return {
    listing_id: listing.listing_id,
    public_slug: listing.public_slug,
    property_address: listing.property_address,
    city: listing.city,
    state: listing.state,
    listing_price: listing.listing_price ?? null,
    bedrooms: listing.bedrooms ?? null,
    bathrooms: listing.bathrooms ?? null,
    square_footage: listing.square_footage ?? null,
    property_type: listing.property_type || '',
    seo_title: listing.seo_title || '',
    cover_file_id: listing.cover_file_id || '',
    listing_status: listing.listing_status || '',
    placement_label: listing.placement_label || '',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const base44 = createClientFromRequest(req);
    const action = String(body?.action || 'markets');
    const origin = publicOrigin();
    const switches = await readVisibilitySwitches(base44);

    if (action === 'link') {
      const slug = marketSlugFor(body?.city, body?.state);
      if (!slug) return jsonResponse({ ok: true, exists: false });
      const found = rowsOf(await base44.asServiceRole.entities.GeographicMarket.filter({ slug }));
      const market = found[0];
      if (!market) return jsonResponse({ ok: true, exists: false });
      const counts = await base44.asServiceRole.entities.PropertyListing.count(marketQuery(market, { testMode: false }));
      const eligibility = evaluateMarket(market, { published_listings: counts });
      return jsonResponse({
        ok: true,
        exists: true,
        slug,
        title: marketTitle(market),
        path: marketPath(market),
        indexable: marketIndexable(market, eligibility) && switches.geo_publication === true,
      });
    }

    if (action === 'markets') {
      const found = rowsOf(await base44.asServiceRole.entities.GeographicMarket.filter(
        { status: 'published', certification_mode: false },
        { sort: 'city', limit: 200 },
      ));
      const markets = [];
      for (const market of found) {
        const counts = await base44.asServiceRole.entities.PropertyListing.count(marketQuery(market, { testMode: false }));
        const eligibility = evaluateMarket(market, { published_listings: counts });
        if (!eligibility.eligible) continue;
        markets.push({
          slug: market.slug,
          title: marketTitle(market),
          path: marketPath(market),
          city: market.city,
          state: market.state,
          listings: eligibility.published_listings,
          indexable: marketIndexable(market, eligibility),
        });
      }
      return jsonResponse({ ok: true, markets, geo_publication_enabled: switches.geo_publication === true });
    }

    if (action === 'market') {
      const slug = normalizeSlug(body?.slug || '');
      if (!slug) return jsonResponse({ ok: false, error: 'Market not found.' }, 404);
      const found = rowsOf(await base44.asServiceRole.entities.GeographicMarket.filter({ slug }));
      const market = found[0];
      if (!market || market.status !== 'published' || market.certification_mode === true) {
        return jsonResponse({ ok: false, error: 'That market page is not available.' }, 404);
      }

      const page = await loadRankedDirectory(base44, {
        query: marketQuery(market, { testMode: false }),
        limit: 24,
      });
      const counts = await base44.asServiceRole.entities.PropertyListing.count(marketQuery(market, { testMode: false }));
      const eligibility = evaluateMarket(market, { published_listings: counts });

      // Agents shown here are only those actually published and stating this city/state.
      let agents = [];
      try {
        const agentProfiles = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter(
          { profile_type: 'agent', publication_state: 'PUBLISHED', certification_mode: false, state: String(market.state || '').toUpperCase() },
          { limit: 60 },
        )).filter((p) => isPubliclyVisible(p) && String(p.city || '').toLowerCase() === String(market.city || '').toLowerCase());
        const subs = rowsOf(await base44.asServiceRole.entities.VisibilitySubscription.filter({ status: 'active' }, { limit: 200 }));
        const byProfile = {};
        for (const sub of subs) byProfile[String(sub.profile_id)] = String(sub.status || '');
        agents = rankProfessionals(agentProfiles, { profileType: 'agent', subscriptionsByProfile: byProfile })
          .slice(0, 6)
          .map((p) => ({ ...publicDirectoryCard(p), path: profilePath(p) }));
      } catch {
        agents = [];
      }

      const listings = (page.items || []).map(listingCard);
      const seo = marketSeoPayload(market, origin, { listings: page.items || [], agents, eligible: eligibility.eligible });

      return jsonResponse({
        ok: true,
        market: {
          slug: market.slug,
          title: marketTitle(market),
          path: marketPath(market),
          city: market.city,
          state: market.state,
          intro: market.intro || '',
          listings_count: eligibility.published_listings,
        },
        listings,
        agents,
        has_more: page.has_more,
        next_cursor: page.next_cursor,
        seo: { ...seo, indexable: seo.indexing === 'index' },
        eligibility,
        disclosures: PROFILE_DISCLOSURES,
      });
    }

    return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});