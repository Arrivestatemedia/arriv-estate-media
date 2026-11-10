import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveVisibilityActor, rowsOf, jsonResponse, CORS_HEADERS } from '../../shared/visibilityActor.ts';
import { readVisibilitySwitches, visibilitySwitchSummary, VISIBILITY_SWITCH_KEYS } from '../../shared/visibilitySwitches.ts';
import { normalizePlan, planCatalog, planPriceLabel, DEFAULT_PLAN_PRODUCTS } from '../../shared/visibilityPlans.ts';
import { normalizeSlug, publicationBlockers, profilePath } from '../../shared/professionalProfile.ts';
import { marketSlugFor, marketQuery, evaluateMarket, marketIndexable, DEFAULT_MIN_PUBLISHED_LISTINGS } from '../../shared/geoMarkets.ts';
import { requestEdgePurge } from '../../shared/edgeCache.ts';

const MIN_MARKET_INTRO = 120;

function event(record, type, actor, note = '') {
  const events = Array.isArray(record?.events) ? record.events : [];
  return [...events, { type, at: new Date().toISOString(), actor, note }].slice(-60);
}

async function writeSwitch(base44, key, value) {
  const existing = rowsOf(await base44.asServiceRole.entities.AppSetting.filter({ key }));
  if (existing[0]) {
    await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value });
  } else {
    await base44.asServiceRole.entities.AppSetting.create({ key, value });
  }
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
    const actor = await resolveVisibilityActor(base44, body);
    if (!actor.isAdmin) return jsonResponse({ ok: false, error: 'Administrator access required.' }, 403);

    const action = String(body?.action || 'overview');
    const switches = await readVisibilitySwitches(base44);

    if (action === 'overview') {
      const [profiles, subscriptions, markets, inquiries] = await Promise.all([
        base44.asServiceRole.entities.ProfessionalProfile.list('-created_date', 200).catch(() => []),
        base44.asServiceRole.entities.VisibilitySubscription.list('-created_date', 200).catch(() => []),
        base44.asServiceRole.entities.GeographicMarket.list('-created_date', 200).catch(() => []),
        base44.asServiceRole.entities.ProfileInquiry.list('-created_date', 200).catch(() => []),
      ]);
      const listOf = (r) => rowsOf(r);
      const profileList = listOf(profiles);
      const subList = listOf(subscriptions);
      const marketList = listOf(markets);
      const inquiryList = listOf(inquiries);
      return jsonResponse({
        ok: true,
        switches: visibilitySwitchSummary(switches),
        counts: {
          profiles_total: profileList.length,
          profiles_published: profileList.filter((p) => p.publication_state === 'PUBLISHED').length,
          profiles_pending_review: profileList.filter((p) => p.publication_state === 'READY_FOR_REVIEW').length,
          profiles_unverified_affiliation: profileList.filter((p) => p.profile_type === 'agent' && p.brokerage_affiliation_verified !== true).length,
          subscriptions_total: subList.length,
          subscriptions_active: subList.filter((s) => s.status === 'active').length,
          subscriptions_past_due: subList.filter((s) => s.status === 'past_due').length,
          subscriptions_cancel_at_period_end: subList.filter((s) => s.cancel_at_period_end === true).length,
          markets_total: marketList.length,
          markets_published: marketList.filter((m) => m.status === 'published').length,
          inquiries_total: inquiryList.length,
          inquiries_failed: inquiryList.filter((i) => i.notification_status === 'failed').length,
          inquiries_review: inquiryList.filter((i) => i.status === 'review').length,
        },
        integrations: {
          stripe_configured: !!String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || ''),
          brevo_configured: !!String((globalThis as any)?.process?.env?.BREVO_API_KEY || ''),
          edge_purge_configured: !!String((globalThis as any)?.process?.env?.PROPERTY_EDGE_PURGE_URL || '') && !!String((globalThis as any)?.process?.env?.PROPERTY_EDGE_PURGE_SECRET || ''),
        },
      });
    }

    if (action === 'plans') {
      return jsonResponse({ ok: true, plans: planCatalog(rowsOf(await base44.asServiceRole.entities.VisibilityPlanProduct.list('-created_date', 50))), defaults: DEFAULT_PLAN_PRODUCTS });
    }

    if (action === 'save_plan') {
      const key = String(body?.product_key || '');
      const fallback = DEFAULT_PLAN_PRODUCTS.find((p) => p.product_key === key);
      if (!fallback) return jsonResponse({ ok: false, error: 'Unknown plan.' }, 400);
      const price = Number(body?.price_cents);
      if (!Number.isFinite(price) || price < 0) return jsonResponse({ ok: false, error: 'A valid monthly price is required.' }, 400);
      const patch = {
        product_key: key,
        tier: fallback.tier,
        name: String(body?.name || fallback.name).slice(0, 120),
        tagline: String(body?.tagline || fallback.tagline).slice(0, 300),
        price_cents: Math.round(price),
        currency: 'usd',
        interval: 'month',
        seats_included: Math.max(0, Number(body?.seats_included ?? fallback.seats_included)),
        additional_seat_price_cents: Math.max(0, Number(body?.additional_seat_price_cents ?? fallback.additional_seat_price_cents)),
        seat_policy: ['included_only', 'per_seat', 'contact_support'].includes(String(body?.seat_policy)) ? body.seat_policy : fallback.seat_policy,
        stripe_price_id: String(body?.stripe_price_id || '').slice(0, 200),
        stripe_product_id: String(body?.stripe_product_id || '').slice(0, 200),
        disclosure: String(body?.disclosure || fallback.disclosure).slice(0, 1200),
        features: Array.isArray(body?.features) && body.features.length ? body.features.map((f) => String(f).slice(0, 200)) : fallback.features,
        active: body?.active !== false,
        updated_by: actor.email,
        updated_at: new Date().toISOString(),
      };
      const existing = rowsOf(await base44.asServiceRole.entities.VisibilityPlanProduct.filter({ product_key: key }));
      if (existing[0]) {
        await base44.asServiceRole.entities.VisibilityPlanProduct.update(existing[0].id, patch);
      } else {
        await base44.asServiceRole.entities.VisibilityPlanProduct.create({ ...patch, sort_order: fallback.sort_order, entitlements: fallback.entitlements, created_at: new Date().toISOString() });
      }
      return jsonResponse({ ok: true, plan: normalizePlan({ ...patch, entitlements: fallback.entitlements }), price_label: planPriceLabel(patch.price_cents) });
    }

    if (action === 'profiles') {
      const query = {};
      if (body?.profile_type) query.profile_type = body.profile_type;
      if (body?.publication_state) query.publication_state = body.publication_state;
      return jsonResponse({
        ok: true,
        profiles: rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter(query, { sort: '-updated_at', limit: 100 })),
      });
    }

    if (action === 'markets') {
      return jsonResponse({
        ok: true,
        markets: rowsOf(await base44.asServiceRole.entities.GeographicMarket.list('-updated_at', 200)),
        minimum_intro_chars: MIN_MARKET_INTRO,
        default_minimum_listings: DEFAULT_MIN_PUBLISHED_LISTINGS,
      });
    }

    if (action === 'save_market') {
      const city = String(body?.city || '').trim();
      const state = String(body?.state || '').trim().toUpperCase().slice(0, 2);
      if (!city || state.length !== 2) return jsonResponse({ ok: false, error: 'A city and two-letter state are required.' }, 400);
      const slug = normalizeSlug(body?.slug || marketSlugFor(city, state));
      const patch = {
        slug,
        city,
        state,
        state_name: String(body?.state_name || '').slice(0, 60),
        county: String(body?.county || '').slice(0, 80),
        intro: String(body?.intro || '').slice(0, 2000),
        minimum_published_listings: Math.max(1, Number(body?.minimum_published_listings ?? DEFAULT_MIN_PUBLISHED_LISTINGS)),
        minimum_published_agents: Math.max(0, Number(body?.minimum_published_agents || 0)),
        indexing: body?.indexing === 'index' ? 'index' : 'noindex',
        updated_at: new Date().toISOString(),
      };
      const existing = rowsOf(await base44.asServiceRole.entities.GeographicMarket.filter({ slug }));
      if (existing[0]) {
        await base44.asServiceRole.entities.GeographicMarket.update(existing[0].id, { ...patch, events: event(existing[0], 'market_updated', actor.email) });
        return jsonResponse({ ok: true, market: { ...existing[0], ...patch } });
      }
      const created = await base44.asServiceRole.entities.GeographicMarket.create({
        market_id: `geo_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        ...patch,
        status: 'draft',
        sitemap_eligible: false,
        created_at: new Date().toISOString(),
        events: [{ type: 'market_created', at: new Date().toISOString(), actor: actor.email, note: slug }],
      });
      return jsonResponse({ ok: true, market: created });
    }

    if (action === 'market_publish' || action === 'market_unpublish' || action === 'refresh_markets') {
      const targets = action === 'refresh_markets'
        ? rowsOf(await base44.asServiceRole.entities.GeographicMarket.list('-updated_at', 200))
        : rowsOf(await base44.asServiceRole.entities.GeographicMarket.filter({ market_id: String(body?.marketId || '') }));

      if (!targets.length) return jsonResponse({ ok: false, error: 'Market not found.' }, 404);
      const results = [];

      for (const market of targets) {
        if (action === 'market_unpublish') {
          await base44.asServiceRole.entities.GeographicMarket.update(market.id, {
            status: 'unpublished',
            indexing: 'noindex',
            sitemap_eligible: false,
            updated_at: new Date().toISOString(),
            events: event(market, 'market_unpublished', actor.email),
          });
          results.push({ slug: market.slug, status: 'unpublished' });
          continue;
        }

        const counts = await base44.asServiceRole.entities.PropertyListing.count(marketQuery(market, { testMode: false }));
        const eligibility = evaluateMarket(market, { published_listings: counts });

        if (action === 'market_publish') {
          if (switches.geo_publication !== true) {
            return jsonResponse({ ok: false, error: 'Geographic page publication is switched off.' }, 403);
          }
          if (!eligibility.eligible) {
            return jsonResponse({
              ok: false,
              error: `This market does not have enough published properties yet (${eligibility.published_listings} of ${eligibility.required_listings}).`,
              eligibility,
            }, 400);
          }
          if (String(market.intro || '').trim().length < MIN_MARKET_INTRO) {
            return jsonResponse({ ok: false, error: `Write at least ${MIN_MARKET_INTRO} characters of factual introduction before publishing.` }, 400);
          }
        }

        const indexable = action === 'market_publish' && eligibility.eligible;
        await base44.asServiceRole.entities.GeographicMarket.update(market.id, {
          status: action === 'market_publish' ? 'published' : market.status,
          eligibility,
          indexing: indexable ? 'index' : 'noindex',
          sitemap_eligible: indexable,
          approved_at: market.approved_at || (action === 'market_publish' ? new Date().toISOString() : undefined),
          approved_by: market.approved_by || (action === 'market_publish' ? actor.email : undefined),
          last_index_check_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          events: event(market, 'market_evaluated', actor.email, eligibility.reason || 'eligible'),
        });
        results.push({ slug: market.slug, eligible: eligibility.eligible, indexable, listings: eligibility.published_listings });
      }

      return jsonResponse({ ok: true, results, sitemap_purge: await requestEdgePurge({ slugs: [] }) });
    }

    if (action === 'subscriptions') {
      const query = {};
      if (body?.status) query.status = body.status;
      return jsonResponse({
        ok: true,
        subscriptions: rowsOf(await base44.asServiceRole.entities.VisibilitySubscription.filter(query, { sort: '-created_date', limit: 100 })),
      });
    }

    if (action === 'inquiries') {
      const query = {};
      if (body?.status) query.status = body.status;
      if (body?.notification_status) query.notification_status = body.notification_status;
      return jsonResponse({
        ok: true,
        inquiries: rowsOf(await base44.asServiceRole.entities.ProfileInquiry.filter(query, { sort: '-created_at', limit: 100 })),
      });
    }

    if (action === 'set_switch') {
      const name = String(body?.switchName || '');
      const key = VISIBILITY_SWITCH_KEYS[name];
      if (!key) return jsonResponse({ ok: false, error: 'Unknown switch.' }, 400);
      if (body?.confirm !== true) return jsonResponse({ ok: false, error: 'Enabling this requires explicit confirmation.' }, 400);
      await writeSwitch(base44, key, body?.enabled === true ? 'true' : 'false');
      return jsonResponse({ ok: true, switches: visibilitySwitchSummary(await readVisibilitySwitches(base44)) });
    }

    if (action === 'blockers') {
      const found = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_id: String(body?.profileId || '') }));
      const profile = found[0];
      if (!profile) return jsonResponse({ ok: false, error: 'Profile not found.' }, 404);
      return jsonResponse({
        ok: true,
        blockers: publicationBlockers(profile, { switchOn: switches.profile_publication }),
        path: profilePath(profile),
      });
    }

    return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});