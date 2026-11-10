import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { rowsOf, jsonResponse, CORS_HEADERS } from '../../shared/visibilityActor.ts';
import { isPubliclyVisible, publicProfileView, profilePath, PROFILE_DISCLOSURES, canIndex } from '../../shared/professionalProfile.ts';
import { profileSeoPayload } from '../../shared/professionalSeo.ts';
import { publicDirectoryCard, placementDisclosure, rankProfessionals } from '../../shared/professionalRanking.ts';
import { normalizeSlug } from '../../shared/professionalProfile.ts';
import { publicOrigin } from '../../shared/propertyVisibility.ts';
import { directoryQuery } from '../../shared/propertyDirectoryQuery.ts';
import { certificationScope } from '../../shared/propertyVisibility.ts';

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
    const action = String(body?.action || 'directory');
    const origin = publicOrigin();
    const profileType = String(body?.profileType || 'agent') === 'brokerage' ? 'brokerage' : 'agent';

    if (action === 'directory') {
      const published = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter(
        { profile_type: profileType, publication_state: 'PUBLISHED', certification_mode: false },
        { sort: 'display_name', limit: 300 },
      )).filter(isPubliclyVisible);

      const subs = rowsOf(await base44.asServiceRole.entities.VisibilitySubscription.filter({ status: 'active' }, { limit: 400 }));
      const byProfile = {};
      for (const sub of subs) byProfile[String(sub.profile_id)] = String(sub.status || '');

      const stateFilter = String(body?.state || '').trim().toUpperCase();
      const q = normalizeSlug(body?.q || '').replace(/-/g, ' ');
      const filtered = published.filter((p) => {
        if (stateFilter && String(p.state || '').toUpperCase() !== stateFilter) return false;
        if (!q) return true;
        const haystack = `${p.display_name || ''} ${p.city || ''} ${p.state || ''} ${(p.service_areas || []).join(' ')}`.toLowerCase();
        return haystack.includes(q);
      });

      const ranked = rankProfessionals(filtered, { profileType, subscriptionsByProfile: byProfile })
        .slice(0, profileType === 'brokerage' ? 24 : 24);

      return jsonResponse({
        ok: true,
        profile_type: profileType,
        total: filtered.length,
        profiles: ranked.map((p) => ({
          ...publicDirectoryCard(p),
          path: profilePath(p),
          placement_disclosure: p.placement_weight ? placementDisclosure(p) : '',
        })),
        disclosures: PROFILE_DISCLOSURES,
      });
    }

    if (action === 'profile') {
      const slug = normalizeSlug(body?.slug || '');
      if (!slug) return jsonResponse({ ok: false, error: 'Missing profile.' }, 404);
      const found = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_type: profileType, slug }));
      const profile = found[0];
      if (!profile || !isPubliclyVisible(profile)) {
        return jsonResponse({ ok: false, error: 'That profile is not available.' }, 404);
      }

      // Only publicly eligible listings are ever attached to a profile.
      const eligibility = directoryQuery({ testMode: false });
      const byEmail = String(profile.contact_email || '').toLowerCase();
      let listings = [];
      if (byEmail.includes('@')) {
        listings = rowsOf(await base44.asServiceRole.entities.PropertyListing.filter(
          { ...eligibility, agent_email: byEmail },
          { sort: '-published_at', limit: 24 },
        ));
      }
      const curated = Array.isArray(profile.listing_showcase_ids) ? profile.listing_showcase_ids : [];
      if (!listings.length && curated.length) {
        const extra = rowsOf(await base44.asServiceRole.entities.PropertyListing.filter(
          { ...eligibility, listing_id: { $in: curated.slice(0, 24) } },
          { limit: 24 },
        ));
        listings = extra;
      }

      let roster = [];
      if (profileType === 'brokerage') {
        const ids = Array.isArray(profile.managed_agent_profile_ids) ? profile.managed_agent_profile_ids : [];
        if (ids.length) {
          const agents = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter(
            { profile_id: { $in: ids.slice(0, 60) }, publication_state: 'PUBLISHED' },
            { limit: 60 },
          )).filter(isPubliclyVisible);
          roster = agents.map((a) => ({
            display_name: a.display_name,
            path: profilePath(a),
            photo_url: a.photo_url || '',
            headline: a.headline || '',
            broker_verified: a.brokerage_affiliation_verified === true,
          }));
        }
      }

      const view = publicProfileView(profile, {
        listings: listings.map(listingCard),
        roster,
        canonical_url: `${origin}${profilePath(profile)}`,
      });
      const seo = profileSeoPayload(profile, origin, { listings });

      return jsonResponse({
        ok: true,
        profile: view,
        seo: { ...seo, indexable: canIndex(profile) },
        disclosure: placementDisclosure({ placement_weight: 0 }),
      });
    }

    return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});