import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { rowsOf, jsonResponse, CORS_HEADERS } from '../../shared/visibilityActor.ts';
import { isPubliclyVisible, profilePath, PROFILE_DISCLOSURES } from '../../shared/professionalProfile.ts';
import { profileSeoPayload, marketSeoPayload, marketTitle, marketPath } from '../../shared/professionalSeo.ts';
import { publicDirectoryCard, rankProfessionals } from '../../shared/professionalRanking.ts';
import { marketQuery, evaluateMarket, marketIndexable, marketSlugFor } from '../../shared/geoMarkets.ts';
import { loadRankedDirectory } from '../../shared/propertyDirectoryRanking.ts';
import { appOrigin, publicOrigin, certificationScope } from '../../shared/propertyVisibility.ts';
import { renderDirectoryPage, renderMarketPage, renderProfilePage } from '../../shared/professionalPageRender.ts';
import { directoryQuery } from '../../shared/propertyDirectoryQuery.ts';

// The server-rendered public surface for Phase 4.
//
// One endpoint answers both the crawler (format=html, proxied by the Cloudflare Worker) and the app's
// own client pages (JSON). It serves only what the publication rules already allow: an unpublished,
// unauthorized or unapproved profile is a 404, and a market page is only indexable when it is
// published, approved and has the required number of genuinely published properties.

function listingCard(listing: any) {
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
    listing_type: listing.property_type || '',
    placement_label: listing.placement_label || '',
  };
}

async function activeSubscriptions(base44: any): Promise<Record<string, string>> {
  const subs = rowsOf(await base44.asServiceRole.entities.VisibilitySubscription.filter({ status: 'active' }, { limit: 300 }));
  const map: Record<string, string> = {};
  for (const sub of subs) map[String(sub.profile_id)] = String(sub.status || '');
  return map;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(req.url);
  let body: any = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }
  const kind = String(body?.kind || url.searchParams.get('kind') || '');
  const slug = String(body?.slug || url.searchParams.get('slug') || '');
  const format = String(body?.format || url.searchParams.get('format') || 'json');
  const origin = publicOrigin();

  try {
    const base44 = createClientFromRequest(req);

    // ---- agent / brokerage directory -----------------------------------------------------------
    if (kind === 'agent_directory' || kind === 'brokerage_directory') {
      const profileType = kind === 'brokerage_directory' ? 'brokerage' : 'agent';
      const path = profileType === 'brokerage' ? '/brokerages' : '/agents';
      const published = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter(
        { profile_type: profileType, publication_state: 'PUBLISHED', certification_mode: false },
        { sort: 'display_name', limit: 200 },
      )).filter(isPubliclyVisible);
      const subs = await activeSubscriptions(base44);
      const ranked = rankProfessionals(published, { profileType, subscriptionsByProfile: subs }).slice(0, 24);
      const cards = ranked.map((p) => ({ ...publicDirectoryCard(p), path: profilePath(p) }));

      const seo = {
        title: profileType === 'brokerage'
          ? 'Real estate brokerages on Arriv Estate Media'
          : 'Real estate agents on Arriv Estate Media',
        meta_description: profileType === 'brokerage'
          ? 'Browse real estate brokerages with a public profile on Arriv Estate Media.'
          : 'Browse real estate agents with a public profile on Arriv Estate Media, see the properties they represent and contact the agent directly.',
        robots: 'index, follow',
        canonical_url: `${origin}${path}`,
        breadcrumbs: [
          { name: 'Arriv Estate Media', url: `${origin}/` },
          { name: profileType === 'brokerage' ? 'Brokerages' : 'Agents', url: `${origin}${path}` },
        ],
      };

      if (format === 'html') {
        return new Response(renderDirectoryPage({ seo, profileType, profiles: cards }), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
        });
      }
      return jsonResponse({ ok: true, profiles: cards, total: published.length, disclosures: PROFILE_DISCLOSURES });
    }

    // ---- a single profile ----------------------------------------------------------------------
    if (kind === 'profile') {
      const profileType = String(body?.profileType || url.searchParams.get('profileType') || 'agent') === 'brokerage' ? 'brokerage' : 'agent';
      const found = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_type: profileType, slug }));
      const profile = found[0];
      if (!profile || !isPubliclyVisible(profile)) {
        if (format === 'html') {
          return new Response('<!DOCTYPE html><html><head><meta name="robots" content="noindex,nofollow" /><title>Profile not available</title></head><body><h1>Profile not available</h1></body></html>', {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
          });
        }
        return jsonResponse({ ok: false, error: 'That profile is not available.' }, 404);
      }

      const eligibility = directoryQuery({ testMode: false });
      const email = String(profile.contact_email || '').toLowerCase();
      let listings = email.includes('@')
        ? rowsOf(await base44.asServiceRole.entities.PropertyListing.filter(
          { ...eligibility, agent_email: email },
          { sort: '-published_at', limit: 24 },
        ))
        : [];
      const curated = Array.isArray(profile.listing_showcase_ids) ? profile.listing_showcase_ids : [];
      if (!listings.length && curated.length) {
        listings = rowsOf(await base44.asServiceRole.entities.PropertyListing.filter(
          { ...eligibility, listing_id: { $in: curated.slice(0, 24) } },
          { limit: 24 },
        ));
      }

      let roster: any[] = [];
      if (profileType === 'brokerage') {
        const ids = Array.isArray(profile.managed_agent_profile_ids) ? profile.managed_agent_profile_ids : [];
        if (ids.length) {
          roster = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter(
            { profile_id: { $in: ids.slice(0, 40) }, publication_state: 'PUBLISHED' },
            { limit: 40 },
          )).filter(isPubliclyVisible).map((agent) => ({
            display_name: agent.display_name,
            path: profilePath(agent),
            headline: agent.headline || '',
          }));
        }
      }

      const seo = profileSeoPayload(profile, origin, { listings });
      const view = {
        profile_id: profile.profile_id,
        profile_type: profile.profile_type,
        slug: profile.slug,
        path: profilePath(profile),
        display_name: profile.display_name,
        headline: profile.headline || '',
        bio: profile.bio || '',
        photo_url: profile.photo_url || '',
        logo_url: profile.logo_url || '',
        contact_email: profile.contact_email || '',
        contact_phone: profile.contact_phone || '',
        city: profile.city || '',
        state: profile.state || '',
        service_areas: Array.isArray(profile.service_areas) ? profile.service_areas : [],
        brokerage_name: profile.brokerage_affiliation_verified ? profile.brokerage_name || '' : '',
        license_number: profile.license_verified ? profile.license_number || '' : '',
        license_state: profile.license_verified ? profile.license_state || '' : '',
        disclosures: PROFILE_DISCLOSURES,
        listings: listings.map(listingCard),
        roster,
      };

      if (format === 'html') {
        return new Response(renderProfilePage({
          profile: view,
          seo,
          listings: listings.map(listingCard),
          roster,
          contactUrl: `${appOrigin()}${profilePath(profile)}`,
        }), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
        });
      }
      return jsonResponse({ ok: true, profile: view, seo });
    }

    // ---- a geographic discovery page ------------------------------------------------------------
    if (kind === 'market') {
      const found = rowsOf(await base44.asServiceRole.entities.GeographicMarket.filter({ slug }));
      const market = found[0];
      if (!market || market.status !== 'published' || market.certification_mode === true) {
        if (format === 'html') {
          return new Response('<!DOCTYPE html><html><head><meta name="robots" content="noindex,nofollow" /><title>Area not available</title></head><body><h1>No property page for this area yet</h1></body></html>', {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
          });
        }
        return jsonResponse({ ok: false, error: 'That market page is not available.' }, 404);
      }

      const page = await loadRankedDirectory(base44, { query: marketQuery(market, { testMode: false }), limit: 24 });
      const counts = await base44.asServiceRole.entities.PropertyListing.count(marketQuery(market, { testMode: false }));
      const eligibility = evaluateMarket(market, { published_listings: counts });

      let agents: any[] = [];
      try {
        const sameCity = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter(
          {
            profile_type: 'agent',
            publication_state: 'PUBLISHED',
            certification_mode: false,
            state: String(market.state || '').toUpperCase(),
          },
          { limit: 60 },
        )).filter((p) => isPubliclyVisible(p) && String(p.city || '').toLowerCase() === String(market.city || '').toLowerCase());
        const subs = await activeSubscriptions(base44);
        agents = rankProfessionals(sameCity, { profileType: 'agent', subscriptionsByProfile: subs })
          .slice(0, 6)
          .map((p) => ({ ...publicDirectoryCard(p), path: profilePath(p) }));
      } catch {
        agents = [];
      }

      const seo = marketSeoPayload(market, origin, { listings: page.items || [], agents, eligible: eligibility.eligible });

      if (format === 'html') {
        return new Response(renderMarketPage({
          market: { ...market, listings_count: eligibility.published_listings },
          seo,
          listings: (page.items || []).map(listingCard),
          agents,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=600',
            'X-Robots-Tag': marketIndexable(market, eligibility) ? 'index, follow' : 'noindex, follow',
          },
        });
      }
      return jsonResponse({
        ok: true,
        market: { ...market, title: marketTitle(market), path: marketPath(market), listings_count: eligibility.published_listings },
        listings: (page.items || []).map(listingCard),
        agents,
        seo,
        eligibility,
        disclosures: PROFILE_DISCLOSURES,
      });
    }

    // ---- the index of markets that may be linked to -------------------------------------------
    if (kind === 'market_link') {
      const derived = marketSlugFor(body?.city || url.searchParams.get('city'), body?.state || url.searchParams.get('state'));
      if (!derived) return jsonResponse({ ok: true, exists: false });
      const market = rowsOf(await base44.asServiceRole.entities.GeographicMarket.filter({ slug: derived }))[0];
      if (!market) return jsonResponse({ ok: true, exists: false });
      const counts = await base44.asServiceRole.entities.PropertyListing.count(marketQuery(market, { testMode: false }));
      const eligibility = evaluateMarket(market, { published_listings: counts });
      return jsonResponse({
        ok: true,
        exists: market.status === 'published',
        slug: derived,
        title: marketTitle(market),
        path: marketPath(market),
        indexable: marketIndexable(market, eligibility),
      });
    }

    return jsonResponse({ ok: false, error: 'Unknown page kind.' }, 400);
  } catch (error) {
    if (format === 'html') {
      return new Response('Page temporarily unavailable', { status: 503, headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
    }
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});