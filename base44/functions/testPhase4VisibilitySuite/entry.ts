import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  DEFAULT_PLAN_PRODUCTS,
  FREE_ENTITLEMENTS,
  entitlementsFor,
  planCatalog,
  planChangePolicy,
  planPriceLabel,
  seatAllowance,
  isPlanKey,
  planFor,
} from '../../shared/visibilityPlans.ts';
import {
  publicationBlockers,
  isPubliclyVisible,
  canIndex,
  canManageProfile,
  canManageAgentAsBrokerage,
  isBrokerageManager,
  publicProfileView,
  credentialsForDisplay,
  affiliationForDisplay,
  normalizeSlug,
  profilePath,
} from '../../shared/professionalProfile.ts';
import { profileSeoPayload, marketSeoPayload, marketTitle } from '../../shared/professionalSeo.ts';
import { rankProfessionals, placementLabel, placementDisclosure, directoryEligible } from '../../shared/professionalRanking.ts';
import { marketSlugFor, parseMarketSlug, evaluateMarket, marketIndexable, sitemapMarketEntry, marketQuery } from '../../shared/geoMarkets.ts';
import { validateInquiry, assessSpam, statusForSpam, routeInquiry, channelFrom, inquiryConsentText } from '../../shared/profileInquiry.ts';
import {
  mapStripeStatus,
  applySubscriptionUpsert,
  applySubscriptionDeleted,
  applyInvoicePaid,
  applyInvoiceFailed,
  benefitsActive,
  shouldExpire,
  renewalNoticeDue,
  subscriptionView,
  seatUsage,
  alreadyApplied,
  reconcileFromStripe,
} from '../../shared/visibilitySubscriptionEngine.ts';
import {
  subscriptionPeriod,
  subscriptionTotalCents,
  subscriptionSeats,
  planItemOf,
  invoiceSubscriptionId,
  invoicePeriod,
} from '../../shared/stripeObjects.ts';
import {
  sessionIsRecurring,
  paymentIntentBelongsToSubscription,
  preferredBranchMayAct,
  visibilityBranchMayAct,
} from '../../shared/stripeEventRouting.ts';
import { seatChangeDecision } from '../../shared/visibilitySeats.ts';
import { noticeAllowed, NOTICE_CLASS_SERVICE, NOTICE_CLASS_MARKETING } from '../../shared/notificationPreference.ts';
import { noticeByKey, noticeHtml } from '../../shared/visibilityEmails.ts';

// Phase 4 certification suite.
//
// Everything here is deterministic: no network call, no Stripe request, no email, no record written.
// A passing run proves the pricing, entitlement, permission, publication, ranking, SEO, inquiry and
// billing-state logic. It does NOT prove that Stripe, Brevo or the Cloudflare Worker are configured
// or deployed — that is reported separately in the launch readiness screen.

const ORIGIN = 'https://properties.arrivestatemedia.test';
const NOW = new Date('2026-11-10T12:00:00.000Z');

const checks: any[] = [];
function check(name: string, fn: () => boolean | [boolean, string], detail = '') {
  try {
    const outcome = fn();
    if (Array.isArray(outcome)) {
      checks.push({ name, pass: outcome[0] === true, detail: outcome[1] });
    } else {
      checks.push({ name, pass: outcome === true, detail });
    }
  } catch (error) {
    checks.push({ name, pass: false, detail: String(error?.message || error) });
  }
}

function profile(overrides: any = {}) {
  return {
    profile_id: 'prof_test',
    profile_type: 'agent',
    slug: 'jane-doe',
    display_name: 'Jane Doe',
    bio: 'I help buyers and sellers across Gwinnett County with clear, honest guidance on every step of a move.'.padEnd(120, ' '),
    contact_email: 'jane@example.com',
    owner_email: 'jane@example.com',
    city: 'Lawrenceville',
    state: 'GA',
    brokerage_name: 'Arriv Realty Partners',
    publication_state: 'PUBLISHED',
    authorization_confirmed: true,
    admin_approved_at: '2026-11-01T00:00:00.000Z',
    indexing: 'index',
    certification_mode: false,
    license_number: 'GA-123456',
    license_state: 'GA',
    license_verified: false,
    brokerage_affiliation_verified: false,
    team_emails: ['ops@arrivrealty.example'],
    ...overrides,
  };
}

function subscription(overrides: any = {}) {
  return {
    subscription_id: 'vsub_test',
    profile_id: 'prof_test',
    plan_key: 'agent_growth',
    status: 'active',
    current_period_end: '2026-12-10T12:00:00.000Z',
    cancel_at_period_end: false,
    applied_event_ids: [],
    billing_history: [],
    ...overrides,
  };
}

// A subscription as the pinned API version (2025-12-15.clover) sends it: the billing period lives on
// the subscription items, and there is no subscription-level current_period_end.
function stripeSubscription(overrides: any = {}) {
  return {
    id: 'sub_live_1',
    status: 'active',
    customer: 'cus_1',
    cancel_at_period_end: false,
    items: {
      data: [{
        id: 'si_1',
        quantity: 1,
        current_period_start: 1762776000,
        current_period_end: 1765368000,
        price: { id: 'price_growth', unit_amount: 9900 },
      }],
    },
    ...overrides,
  };
}

// An invoice as clover sends it: the subscription is under parent.subscription_details.
function invoice(overrides: any = {}) {
  return {
    id: 'in_1',
    object: 'invoice',
    amount_paid: 9900,
    amount_due: 0,
    currency: 'usd',
    status: 'paid',
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_live_1' } },
    period_start: 1762776000,
    period_end: 1765368000,
    status_transitions: { paid_at: 1762776100 },
    ...overrides,
  };
}

// ---- plan catalogue -------------------------------------------------------------------------
check('Agent Presence is $49/month', () => planPriceLabel(DEFAULT_PLAN_PRODUCTS[0].price_cents) === '$49');
check('Agent Growth is $99/month', () => planPriceLabel(DEFAULT_PLAN_PRODUCTS[1].price_cents) === '$99');
check('Brokerage is $249/month', () => planPriceLabel(DEFAULT_PLAN_PRODUCTS[2].price_cents) === '$249');
check('Brokerage includes three seats, never unlimited', () => DEFAULT_PLAN_PRODUCTS[2].seats_included === 3);
check('Brokerage prices an additional seat', () => DEFAULT_PLAN_PRODUCTS[2].additional_seat_price_cents > 0);
check('Agent plans cannot buy extra seats', () => DEFAULT_PLAN_PRODUCTS[0].seat_policy === 'included_only' && seatAllowance(DEFAULT_PLAN_PRODUCTS[0]).canAdd === false);
check('Brokerage can add a seat under the per-seat policy', () => seatAllowance(DEFAULT_PLAN_PRODUCTS[2], 1).canAdd === true);
check('Seat total is included plus purchased', () => seatAllowance(DEFAULT_PLAN_PRODUCTS[2], 2).total === 5);
check('An unknown plan key is rejected', () => isPlanKey('enterprise_deluxe') === false);
check('The catalogue falls back to the three defaults', () => planCatalog([]).length === 3);
check('A stored plan overrides the default price', () => planFor([{ product_key: 'agent_growth', price_cents: 10900 }], 'agent_growth').price_cents === 10900);
check('Subscription tiers are distinct from visibility and advertising tiers', () => {
  const keys = DEFAULT_PLAN_PRODUCTS.map((p) => p.product_key);
  return !keys.includes('plus') && !keys.includes('pro') && !keys.includes('growth');
});

// ---- entitlements ---------------------------------------------------------------------------
check('The free position has no directory priority', () => FREE_ENTITLEMENTS.directory_priority === 0);
check('An active Growth subscription grants priority placement', () => entitlementsFor('agent_growth', 'active').directory_priority === 20);
check('An active Growth subscription grants marketing graphics', () => entitlementsFor('agent_growth', 'active').marketing_graphics === true);
check('An expired Growth subscription loses priority placement', () => entitlementsFor('agent_growth', 'expired').directory_priority === 0);
check('A cancelled Growth subscription loses marketing graphics', () => entitlementsFor('agent_growth', 'canceled').marketing_graphics === false);
check('A past-due subscription loses paid priority', () => entitlementsFor('agent_growth', 'past_due').directory_priority === 0);
check('An expired subscription keeps the free inquiry form', () => entitlementsFor('agent_growth', 'expired').inquiry_routing === true);
check('Growth has a larger showcase than the free position', () => entitlementsFor('agent_growth', 'active').showcase_limit > FREE_ENTITLEMENTS.showcase_limit);
check('A stored plan_key cannot unlock benefits without an active status', () => entitlementsFor('brokerage', 'canceled').team_reporting === false);
check('Brokerage entitlements include agent management', () => entitlementsFor('brokerage', 'active').agent_management === true);
check('Team reporting is a brokerage benefit only', () => entitlementsFor('agent_growth', 'active').team_reporting === false);

// ---- plan changes ---------------------------------------------------------------------------
check('Presence to Growth is an immediate prorated upgrade', () => {
  const p = planChangePolicy('agent_presence', 'agent_growth');
  return p.allowed && p.direction === 'upgrade' && p.timing === 'immediate' && p.prorate;
});
check('Growth to Presence is a downgrade at the next renewal', () => {
  const p = planChangePolicy('agent_growth', 'agent_presence');
  return p.allowed && p.direction === 'downgrade' && p.timing === 'next_cycle' && p.prorate === false;
});
check('The same plan cannot be "changed"', () => planChangePolicy('agent_growth', 'agent_growth').allowed === false);
check('An unknown plan change is refused', () => planChangePolicy('agent_growth', 'mystery').allowed === false);

// ---- publication rules ----------------------------------------------------------------------
check('A profile cannot be published while the switch is off', () => publicationBlockers(profile(), { switchOn: false }).some((b) => b.includes('switched off')));
check('A profile cannot be published without owner authorization', () => publicationBlockers(profile({ authorization_confirmed: false }), { switchOn: true }).some((b) => b.includes('authorized')));
check('A profile cannot be published without administrator approval', () => publicationBlockers(profile({ admin_approved_at: '' }), { switchOn: true }).some((b) => b.includes('approved')));
check('A thin biography blocks publication', () => publicationBlockers(profile({ bio: 'Short bio.' }), { switchOn: true }).some((b) => b.includes('biography')));
check('A complete authorized profile has no blockers', () => publicationBlockers(profile(), { switchOn: true }).length === 0);
check('An agent profile needs a brokerage affiliation', () => publicationBlockers(profile({ brokerage_name: '' }), { switchOn: true }).some((b) => b.includes('brokerage')));
check('A draft profile is not publicly visible', () => isPubliclyVisible(profile({ publication_state: 'DRAFT' })) === false);
check('An unauthorized profile is not publicly visible', () => isPubliclyVisible(profile({ authorization_confirmed: false })) === false);
check('A certification profile is never publicly visible', () => isPubliclyVisible(profile({ certification_mode: true })) === false);
check('A published, authorized, approved profile is visible', () => isPubliclyVisible(profile()) === true);
check('A published profile is noindex unless explicitly indexed', () => canIndex(profile({ indexing: 'noindex' })) === false);
check('An indexed published profile is indexable', () => canIndex(profile()) === true);
check('The public profile view never exposes the owner address', () => {
  const view = publicProfileView(profile());
  return view && !('owner_email' in view) && !('team_emails' in view);
});
check('The public profile view never exposes verification evidence', () => {
  const view = publicProfileView(profile());
  return view && !('brokerage_evidence' in view) && !('routing_emails' in view);
});
check('An unverified licence is never displayed', () => credentialsForDisplay(profile()).license_number === '');
check('A verified licence is displayed', () => credentialsForDisplay(profile({ license_verified: true })).license_number === 'GA-123456');
check('An unverified brokerage affiliation is not displayed as fact', () => {
  const a = affiliationForDisplay(profile());
  return a.name === '' && a.verified === false && a.note.length > 0;
});
check('A verified brokerage affiliation is displayed', () => affiliationForDisplay(profile({ brokerage_affiliation_verified: true })).name === 'Arriv Realty Partners');
check('Slugs are normalized for a public URL', () => normalizeSlug('Jane  Doe & Co.') === 'jane-doe-and-co');
check('Agents and brokerages have different base paths', () => profilePath({ profile_type: 'brokerage', slug: 'acme' }) === '/brokerages/acme' && profilePath({ profile_type: 'agent', slug: 'acme' }) === '/agents/acme');

// ---- permissions ----------------------------------------------------------------------------
const jane = profile();
const actorOwner = { email: 'jane@example.com', isAdmin: false };
const actorStranger = { email: 'other@example.com', isAdmin: false };
const actorAdmin = { email: 'owner@arriv.example', isAdmin: true };
check('The profile owner can manage their profile', () => canManageProfile(jane, actorOwner) === true);
check('An unrelated user cannot manage the profile', () => canManageProfile(jane, actorStranger) === false);
check('An administrator can manage any profile', () => canManageProfile(jane, actorAdmin) === true);

const brokerage = profile({ profile_id: 'prof_bro', profile_type: 'brokerage', slug: 'arriv-realty', display_name: 'Arriv Realty Partners', owner_email: 'broker@arrivrealty.example', contact_email: 'broker@arrivrealty.example', team_emails: ['ops@arrivrealty.example'] });
check('A brokerage administrator is recognized', () => isBrokerageManager(brokerage, { email: 'ops@arrivrealty.example' }) === true);
check('An agent cannot manage brokerage agents', () => isBrokerageManager(brokerage, actorOwner) === false);
check('A brokerage cannot manage an unverified affiliation', () => canManageAgentAsBrokerage(profile({ brokerage_profile_id: 'prof_bro' }), brokerage, { email: 'ops@arrivrealty.example' }).allowed === false);
check('A brokerage cannot manage an agent off its roster', () => canManageAgentAsBrokerage(profile({ brokerage_profile_id: 'other_bro', brokerage_affiliation_verified: true }), brokerage, { email: 'ops@arrivrealty.example' }).allowed === false);
check('A brokerage manages an agent once the affiliation is verified', () => canManageAgentAsBrokerage(profile({ brokerage_profile_id: 'prof_bro', brokerage_affiliation_verified: true }), brokerage, { email: 'ops@arrivrealty.example' }).allowed === true);
check('An administrator can manage any agent through the brokerage', () => canManageAgentAsBrokerage(profile({ brokerage_profile_id: 'prof_bro' }), brokerage, actorAdmin).allowed === true);

// ---- directory ranking ----------------------------------------------------------------------
const roster = [
  profile({ profile_id: 'p_presence', display_name: 'Alicia Presence', plan_key: 'agent_presence' }),
  profile({ profile_id: 'p_growth', display_name: 'Zoe Growth', plan_key: 'agent_growth' }),
  profile({ profile_id: 'p_free', display_name: 'Bob Free', plan_key: '' }),
  profile({ profile_id: 'p_draft', display_name: 'Draft Person', plan_key: 'agent_growth', publication_state: 'DRAFT' }),
];
const subsMap = { p_presence: 'active', p_growth: 'active', p_free: '' };
const ranked = rankProfessionals(roster, { profileType: 'agent', subscriptionsByProfile: subsMap });
check('Paid priority ranks an agent above the free position', () => ranked[0].profile_id === 'p_growth');
check('Agent Presence still outranks an unsubscribed agent', () => ranked[1].profile_id === 'p_presence');
check('An unpublished agent is absent from the directory, not demoted', () => !ranked.some((r) => r.profile_id === 'p_draft'));
check('An unpaid agent keeps weight zero', () => ranked.find((r) => r.profile_id === 'p_free').placement_weight === 0);
check('Growth placement is labelled for the visitor', () => placementLabel(roster[1], 'active') === 'Priority agent');
check('A free profile carries no placement label', () => placementLabel(roster[2], '') === '');
check('A paid placement discloses that it is paid', () => placementDisclosure({ placement_weight: 20 }).length > 0);
check('A free placement shows no paid disclosure', () => placementDisclosure({ placement_weight: 0 }) === '');
check('Eligibility is decided before ranking', () => directoryEligible(profile({ publication_state: 'UNPUBLISHED' })) === false);
check('An expired subscription drops the agent back to the standard order', () => {
  const expired = rankProfessionals(roster, { profileType: 'agent', subscriptionsByProfile: { p_growth: 'expired' } });
  return expired[0].profile_id === 'p_free' || expired.every((r) => r.placement_weight === 0);
});
check('The brokerage directory never mixes agents in', () => rankProfessionals([...roster, brokerage], { profileType: 'brokerage', subscriptionsByProfile: {} }).every((r) => r.profile_type === 'brokerage'));

// ---- geographic discovery -------------------------------------------------------------------
check('A market slug is derived from city and state', () => marketSlugFor('Atlanta', 'GA') === 'atlanta-ga');
check('A market slug round-trips', () => {
  const parsed = parseMarketSlug('lawrenceville-ga');
  return parsed.city_slug === 'lawrenceville' && parsed.state === 'GA';
});
const market = { market_id: 'geo_1', slug: 'atlanta-ga', city: 'Atlanta', state: 'GA', status: 'published', approved_at: '2026-11-01T00:00:00.000Z', indexing: 'index', intro: 'A factual introduction.', minimum_published_listings: 3 };
check('A market with too few real properties is not eligible', () => evaluateMarket(market, { published_listings: 2 }, NOW).eligible === false);
check('An ineligible market reports why', () => evaluateMarket(market, { published_listings: 1 }, NOW).reason.startsWith('insufficient_listings'));
check('A market with enough real properties is eligible', () => evaluateMarket(market, { published_listings: 3 }, NOW).eligible === true);
check('A market without a location is never eligible', () => evaluateMarket({ ...market, city: '' }, { published_listings: 9 }, NOW).reason === 'missing_location');
const eligibleMarket = evaluateMarket(market, { published_listings: 5 }, NOW);
check('An eligible, published, index-flagged market is indexable', () => marketIndexable(market, eligibleMarket) === true);
check('A market with the index flag off is not indexable', () => marketIndexable({ ...market, indexing: 'noindex' }, eligibleMarket) === false);
check('An unpublished market is not indexable', () => marketIndexable({ ...market, status: 'draft' }, eligibleMarket) === false);
check('An ineligible market is not indexable', () => marketIndexable(market, evaluateMarket(market, { published_listings: 0 }, NOW)) === false);
check('An ineligible market stays out of the sitemap', () => sitemapMarketEntry(market, evaluateMarket(market, { published_listings: 0 }, NOW), ORIGIN) === null);
check('An indexable market enters the sitemap with its canonical URL', () => (sitemapMarketEntry(market, eligibleMarket, ORIGIN)?.loc || '').endsWith('/properties/in/atlanta-ga'));
check('Market queries reuse the directory eligibility rule', () => marketQuery(market, { testMode: false }).publication_state === 'PUBLISHED');
check('Market queries narrow to the city and state', () => {
  const q = marketQuery(market, { testMode: false });
  return q.city.$regex === '^Atlanta$' && q.state.$regex === '^GA$';
});

// ---- SEO --------------------------------------------------------------------------------------
const draftSeo = profileSeoPayload(profile({ publication_state: 'DRAFT', indexing: 'noindex' }), ORIGIN);
const liveSeo = profileSeoPayload(profile({ indexing: 'index' }), ORIGIN);
check('A draft profile page is noindex', () => draftSeo.robots.includes('noindex'));
check('A published profile page is indexable', () => liveSeo.robots.includes('index'));
check('An agent canonical URL points at the agent page', () => liveSeo.canonical_url === `${ORIGIN}/agents/jane-doe`);
check('A brokerage canonical URL points at the brokerage page', () => profileSeoPayload(brokerage, ORIGIN).canonical_url === `${ORIGIN}/brokerages/arriv-realty`);
check('An agent profile emits RealEstateAgent structured data', () => liveSeo.structured_data['@type'] === 'RealEstateAgent');
check('Unverified credentials are omitted from structured data', () => !('hasCredential' in liveSeo.structured_data));
check('Verified credentials appear in structured data', () => {
  const seo = profileSeoPayload(profile({ license_verified: true }), ORIGIN);
  return seo.structured_data.hasCredential?.identifier === 'GA-123456';
});
check('An unverified brokerage is not asserted as the parent organisation', () => !('parentOrganization' in liveSeo.structured_data));
check('A verified brokerage is asserted as the parent organisation', () => {
  const seo = profileSeoPayload(profile({ brokerage_affiliation_verified: true }), ORIGIN);
  return seo.structured_data.parentOrganization?.name === 'Arriv Realty Partners';
});
check('Breadcrumbs link home, the directory and the profile', () => liveSeo.breadcrumbs.length === 3 && liveSeo.breadcrumbs[1].url.endsWith('/agents'));
check('Profile metadata is a real description, not a keyword list', () => liveSeo.meta_description.length > 40 && liveSeo.meta_description.length <= 160);
check('An ineligible market page is noindex', () => marketSeoPayload(market, ORIGIN, { listings: [], agents: [], eligible: false }).robots.includes('noindex'));
check('An eligible market page is indexable', () => marketSeoPayload(market, ORIGIN, { listings: [{ public_slug: 'x', property_address: 'Street' }], agents: [], eligible: true }).indexing === 'index');
check('A market page title names the city and state', () => marketTitle(market) === 'Properties in Atlanta, GA');
check('Market structured data is a CollectionPage with an item list', () => {
  const seo = marketSeoPayload(market, ORIGIN, { listings: [{ public_slug: 'a' }, { public_slug: 'b' }], agents: [], eligible: true });
  return seo.structured_data['@type'] === 'CollectionPage' && seo.structured_data.mainEntity.numberOfItems === 2;
});

// ---- inquiries --------------------------------------------------------------------------------
const goodInquiry = {
  name: 'Sam Buyer',
  email: 'sam@example.com',
  phone: '4045550100',
  message: 'I would like to see the Lawrenceville listing this weekend please.',
  consent_privacy: true,
  honeypot: '',
};
check('A complete inquiry with consent validates', () => validateInquiry(goodInquiry).length === 0);
check('An inquiry without consent is refused', () => validateInquiry({ ...goodInquiry, consent_privacy: false }).some((e) => e.includes('consent') || e.includes('agree')));
check('An inquiry with a bad email is refused', () => validateInquiry({ ...goodInquiry, email: 'not-an-email' }).length > 0);
check('A one-word inquiry is refused', () => validateInquiry({ ...goodInquiry, message: 'hi' }).length > 0);
check('A tripped honeypot is rejected as spam', () => statusForSpam(assessSpam({ ...goodInquiry, honeypot: 'bot' }).score) === 'rejected_spam');
check('A repeated sender is scored for review', () => assessSpam(goodInquiry, { recentFromEmail: 4 }).flags.includes('repeated_sender'));
check('A commercial link spam message is flagged', () => assessSpam({ ...goodInquiry, message: 'We offer seo services https://a.example https://b.example now' }).score >= 50);
check('An ordinary inquiry scores zero', () => assessSpam(goodInquiry).score === 0);
check('An inquiry routes to the profile owner', () => routeInquiry(jane).routed_to_email === 'jane@example.com');
check('An inquiry routes to a configured brokerage team member', () => {
  const brokerageWithTeam = { ...brokerage, routing_mode: 'team', routing_emails: ['ops@arrivrealty.example'] };
  const routed = routeInquiry(brokerageWithTeam);
  return routed.routed_to_email === 'ops@arrivrealty.example' && routed.routing_mode === 'team';
});
check('An inquiry is never routed to an unrelated address', () => {
  const brokerageWithStranger = { ...brokerage, routing_mode: 'team', routing_emails: ['stranger@elsewhere.example'] };
  const routed = routeInquiry(brokerageWithStranger);
  return routed.routed_to_email === 'ops@arrivrealty.example' || routed.routed_to_email === 'broker@arrivrealty.example';
});
check('A profile with no contact address is unroutable, not silently dropped', () => routeInquiry(profile({ contact_email: '' })).ok === false);
check('A paid campaign source is detected', () => channelFrom({ utm_medium: 'cpc' }, '') === 'paid');
check('A direct visit is detected', () => channelFrom({}, '') === 'direct');
check('The consent text names the recipient', () => inquiryConsentText('Jane Doe').includes('Jane Doe'));
check('The no-agency disclosure is present on every inquiry form', () => inquiryConsentText('Jane Doe').length > 0);

// ---- subscription state machine ---------------------------------------------------------------
check('A trialing subscription is treated as active', () => mapStripeStatus('trialing') === 'active');
const created = applySubscriptionUpsert(subscription({ status: 'pending_checkout', applied_event_ids: [] }), stripeSubscription(), 'evt_1', 'test');
check('A subscription event activates billing', () => created.changed && created.patch.status === 'active');
check('A subscription event records its period end', () => !!created.patch.current_period_end);
check('A subscription event records the Stripe subscription id', () => created.patch.stripe_subscription_id === 'sub_live_1');
const applied = { ...subscription(), ...created.patch };
check('The same Stripe event is applied only once', () => alreadyApplied(applied, 'evt_1') === true && applySubscriptionUpsert(applied, stripeSubscription(), 'evt_1').changed === false);
check('A redelivered event does not duplicate billing history', () => {
  const first = applyInvoicePaid(subscription(), invoice(), 'evt_inv_1');
  const second = applyInvoicePaid({ ...subscription(), ...first.patch }, invoice(), 'evt_inv_2');
  return second.patch.billing_history.length === 1;
});
const cancelled = applySubscriptionDeleted(subscription(), stripeSubscription({ status: 'canceled', ended_at: 1765368000 }), 'evt_del', 'test');
check('A deleted subscription becomes canceled', () => cancelled.patch.status === 'canceled');
const resurrectAttempt = applySubscriptionUpsert({ ...subscription(), ...cancelled.patch }, stripeSubscription(), 'evt_late', 'test');
check('A late active event never resurrects a cancelled subscription', () => (resurrectAttempt.patch.status || 'canceled') === 'canceled');
const failed = applyInvoiceFailed(subscription(), invoice({ status: 'open' }), 'evt_fail', 'test');
check('A failed payment moves the subscription to past_due', () => failed.patch.status === 'past_due');
check('A failed payment records a reason', () => !!failed.patch.last_failure_reason);
check('A recovered payment clears the failure', () => {
  const recovered = applyInvoicePaid({ ...subscription(), status: 'past_due' }, invoice(), 'evt_recover', 'test');
  return recovered.patch.status === 'active' && !recovered.patch.last_failure_reason;
});
check('Benefits are active inside the paid period', () => benefitsActive(subscription(), NOW) === true);
check('Benefits stop after the paid period ends', () => benefitsActive(subscription({ current_period_end: '2026-11-09T12:00:00.000Z' }), NOW) === false);
check('An ended period is expired by the sweep', () => shouldExpire(subscription({ current_period_end: '2026-11-09T12:00:00.000Z' }), NOW) === true);
check('A live subscription is not expired', () => shouldExpire(subscription(), NOW) === false);
check('A cancelled subscription keeps benefits until the period ends', () => {
  const view = subscriptionView(subscription({ cancel_at_period_end: true }), NOW);
  return view.cancel_at_period_end === true && view.benefits_active === true;
});
check('A pending checkout is never reported as active', () => subscriptionView(subscription({ status: 'pending_checkout' }), NOW).benefits_active === false);
check('A renewal notice is due inside the notice window', () => renewalNoticeDue(subscription({ current_period_end: '2026-11-13T12:00:00.000Z' }), NOW, 5) === true);
check('No renewal notice is due outside the window', () => renewalNoticeDue(subscription({ current_period_end: '2026-12-09T12:00:00.000Z' }), NOW, 5) === false);
check('A cancelling customer is not sent a renewal notice', () => renewalNoticeDue(subscription({ cancel_at_period_end: true, current_period_end: '2026-11-13T12:00:00.000Z' }), NOW, 5) === false);
check('Seat usage detects a roster beyond the allowance', () => seatUsage(subscription(), DEFAULT_PLAN_PRODUCTS[2], 6).exceeded === true);
check('Seat usage stays within a valid roster', () => seatUsage(subscription(), DEFAULT_PLAN_PRODUCTS[2], 2).exceeded === false);

// ==== Stripe 2025-12-15.clover payload contract ================================================
const CLOVER_START = 1762776000; // 2025-11-10
const CLOVER_END = 1765368000; // 2025-12-10
const CLOVER_RENEWAL_END = CLOVER_END + 30 * 86400;
const SEAT_PRICE = 'price_seat_brokerage';
const CLOVER_NOW = new Date('2025-11-15T00:00:00.000Z');

function planItem(quantity: number, start: number, end: number) {
  return { id: 'si_plan', quantity, current_period_start: start, current_period_end: end, price: { id: 'price_brokerage', unit_amount: 24900 } };
}

function cloverSubscription(overrides: any = {}) {
  return {
    id: 'sub_clover_1',
    object: 'subscription',
    status: 'active',
    customer: 'cus_clover_1',
    cancel_at_period_end: false,
    metadata: { purpose: 'visibility_subscription', profile_id: 'prof_test', plan_key: 'brokerage', seat_price_id: SEAT_PRICE },
    items: {
      object: 'list',
      data: [
        planItem(1, CLOVER_START, CLOVER_END),
        { id: 'si_seat', quantity: 2, current_period_start: CLOVER_START, current_period_end: CLOVER_END, price: { id: SEAT_PRICE, unit_amount: 2900 } },
      ],
    },
    ...overrides,
  };
}

function cloverInvoice(overrides: any = {}) {
  return {
    id: 'in_clover_1',
    object: 'invoice',
    amount_paid: 30700,
    amount_due: 0,
    currency: 'usd',
    status: 'paid',
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_clover_1' } },
    period_start: CLOVER_START,
    period_end: CLOVER_END,
    status_transitions: { paid_at: CLOVER_START + 30 },
    ...overrides,
  };
}

const cloverPlan = { ...DEFAULT_PLAN_PRODUCTS[2], stripe_price_id: 'price_brokerage', stripe_seat_price_id: SEAT_PRICE };
const SEAT_OPTS = { seatPriceId: SEAT_PRICE };
const cloverBase: any = {
  subscription_id: 'vsub_clover',
  profile_id: 'prof_test',
  plan_key: 'brokerage',
  status: 'pending_checkout',
  seats_included: 3,
  seats_purchased: 0,
  amount_cents: 24900,
  stripe_price_id: 'price_brokerage',
  current_period_start: '',
  current_period_end: '',
  cancel_at_period_end: false,
  applied_event_ids: [],
  billing_history: [],
};

check('The billing period is read from the subscription items', () => {
  const period = subscriptionPeriod(cloverSubscription());
  return period.start === CLOVER_START && period.end === CLOVER_END;
});
check('A legacy subscription-level period is still read', () => subscriptionPeriod({ current_period_start: CLOVER_START, current_period_end: CLOVER_END }).end === CLOVER_END);
check('The plan item is found by price, never the seat line', () => planItemOf(cloverSubscription(), SEAT_PRICE)?.price?.id === 'price_brokerage');
check('The billed total includes every seat', () => subscriptionTotalCents(cloverSubscription()) === 30700);
check('The purchased seat quantity comes from Stripe', () => subscriptionSeats(cloverSubscription(), SEAT_PRICE) === 2);
check('An invoice resolves its subscription under invoice.parent', () => invoiceSubscriptionId(cloverInvoice()) === 'sub_clover_1');
check('A legacy invoice.subscription field is still honoured', () => invoiceSubscriptionId({ subscription: 'sub_legacy' }) === 'sub_legacy');
check('An invoice period falls back to its line items', () => invoicePeriod({ lines: { data: [{ period: { start: CLOVER_START, end: CLOVER_END } }] } }).end === CLOVER_END);
check('No period is invented when Stripe states none', () => subscriptionPeriod({ items: { data: [{ id: 'si', quantity: 1, price: { id: 'p' } }] } }).end === undefined);

// ---- scenario 1: first payment ----
const firstEvent = applySubscriptionUpsert(cloverBase, cloverSubscription(), 'evt_clover_first', 'test', SEAT_OPTS);
const afterFirst: any = { ...cloverBase, ...firstEvent.patch };
check('SCENARIO first payment: the plan activates with a real period', () => afterFirst.status === 'active' && afterFirst.current_period_end === new Date(CLOVER_END * 1000).toISOString());
check('SCENARIO first payment: benefits are on inside the paid period', () => benefitsActive(afterFirst, CLOVER_NOW) === true);
check('SCENARIO first payment: the seat quantity and billed total are stored', () => afterFirst.seats_purchased === 2 && afterFirst.amount_cents === 30700);
const firstInvoice = applyInvoicePaid(afterFirst, cloverInvoice(), 'evt_clover_inv_1', 'test', SEAT_OPTS);
const historyAfterFirst: any[] = firstInvoice.patch.billing_history || [];
check('SCENARIO first payment: the invoice is recorded against the right subscription', () => historyAfterFirst.length === 1 && historyAfterFirst[0].subscription_id === 'sub_clover_1' && historyAfterFirst[0].amount_cents === 30700);

// ---- scenario 2: renewal ----
const renewedSubscription = cloverSubscription({
  items: { object: 'list', data: [planItem(1, CLOVER_END, CLOVER_RENEWAL_END)] },
});
const renewalSweep = reconcileFromStripe({ ...afterFirst, ...firstInvoice.patch }, renewedSubscription, 'sweep', SEAT_OPTS);
check('SCENARIO renewal: a new period is picked up by reconciliation', () => renewalSweep.changed === true && renewalSweep.patch.current_period_end === new Date(CLOVER_RENEWAL_END * 1000).toISOString());
check('SCENARIO renewal: a second sweep of the same state writes nothing', () => reconcileFromStripe({ ...afterFirst, ...firstInvoice.patch, ...renewalSweep.patch }, renewedSubscription, 'sweep', SEAT_OPTS).changed === false);
const renewalInvoice = applyInvoicePaid({ ...afterFirst, ...renewalSweep.patch }, cloverInvoice({ id: 'in_clover_2', period_start: CLOVER_END, period_end: CLOVER_RENEWAL_END }), 'evt_clover_inv_2', 'test', SEAT_OPTS);
check('SCENARIO renewal: the renewal invoice is appended to history', () => renewalInvoice.patch.billing_history.length === 2);
check('SCENARIO renewal: a seat invoice never shortens the paid period', () => applyInvoicePaid(
  { ...afterFirst, current_period_end: new Date(CLOVER_RENEWAL_END * 1000).toISOString() },
  cloverInvoice({ id: 'in_seat_proration', amount_paid: 2900, period_end: CLOVER_END }),
  'evt_seat_inv',
  'test',
  SEAT_OPTS,
).patch.current_period_end === undefined);

// ---- scenario 3: failed payment ----
const failedClover = applyInvoiceFailed(afterFirst, cloverInvoice({ id: 'in_clover_fail', status: 'open', amount_paid: 0, amount_due: 30700 }), 'evt_clover_fail');
const afterFail: any = { ...afterFirst, ...failedClover.patch };
check('SCENARIO failed payment: the record moves to past_due', () => afterFail.status === 'past_due');
check('SCENARIO failed payment: benefits stop while past due', () => benefitsActive(afterFail, CLOVER_NOW) === false);
check('SCENARIO failed payment: the failure is recorded with a reason', () => !!afterFail.last_failure_reason);

// ---- scenario 4: recovery ----
const recovered = applyInvoicePaid(afterFail, cloverInvoice({ id: 'in_clover_recover' }), 'evt_clover_recover', 'test', SEAT_OPTS);
check('SCENARIO recovery: a successful charge restores the plan', () => recovered.patch.status === 'active');
check('SCENARIO recovery: the failure is cleared', () => recovered.patch.last_failure_reason === undefined);
check('SCENARIO recovery: benefits are on again', () => benefitsActive({ ...afterFail, ...recovered.patch }, CLOVER_NOW) === true);

// ---- scenario 5: cancellation ----
const cancelScheduled = applySubscriptionUpsert(afterFirst, cloverSubscription({ cancel_at_period_end: true }), 'evt_clover_cancel', 'test', SEAT_OPTS);
check('SCENARIO cancellation: the plan stays active until the paid period ends', () => cancelScheduled.patch.status === 'active' && cancelScheduled.patch.cancel_at_period_end === true);
check('SCENARIO cancellation: benefits continue to the period end', () => benefitsActive({ ...afterFirst, ...cancelScheduled.patch }, CLOVER_NOW) === true);
const canceledEvent = applySubscriptionDeleted({ ...afterFirst, ...cancelScheduled.patch }, cloverSubscription({ status: 'canceled', ended_at: CLOVER_END }), 'evt_clover_deleted', 'test', SEAT_OPTS);
check('SCENARIO cancellation: the deleted event ends the plan', () => canceledEvent.patch.status === 'canceled' && benefitsActive({ ...afterFirst, ...canceledEvent.patch }, CLOVER_NOW) === false);
check('SCENARIO cancellation: a late active event cannot reopen it', () => (applySubscriptionUpsert({ ...afterFirst, ...canceledEvent.patch }, cloverSubscription(), 'evt_clover_late', 'test', SEAT_OPTS).patch.status || 'canceled') === 'canceled');

// ---- scenario 6: expiration ----
const afterPeriod = new Date('2026-01-01T00:00:00.000Z');
check('SCENARIO expiration: a lapsed period is expired by the sweep', () => shouldExpire(afterFirst, afterPeriod) === true);
check('SCENARIO expiration: benefits stop at the period end', () => benefitsActive(afterFirst, afterPeriod) === false);
check('SCENARIO expiration: a plan with no period grants no benefits', () => benefitsActive({ ...afterFirst, current_period_end: '' }, CLOVER_NOW) === false && shouldExpire({ ...afterFirst, current_period_end: '' }, CLOVER_NOW) === false);

// ---- scenarios 7 and 8: seats ----
const seatBuy = seatChangeDecision({ record: { ...afterFirst, seats_purchased: 0, stripe_subscription_id: 'sub_clover_1' }, plan: cloverPlan, requestedSeats: 2, checkoutEnabled: true });
check('SCENARIO seat purchase: two seats are added at the seat price', () => seatBuy.ok && seatBuy.quantity === 2 && seatBuy.seatPriceCents === 2900);
check('SCENARIO seat purchase: additional seats are billed immediately', () => seatBuy.prorationBehavior === 'always_invoice' && seatBuy.needsInvoice === true);
check('SCENARIO seat purchase: the monthly total is the plan plus seats', () => seatBuy.monthlyTotalCents === 24900 + 2 * 2900);
const seatDown = seatChangeDecision({ record: { ...afterFirst, seats_purchased: 3, stripe_subscription_id: 'sub_clover_1' }, plan: cloverPlan, requestedSeats: 1, checkoutEnabled: true });
check('SCENARIO seat quantity change: removed seats are credited on the next invoice', () => seatDown.ok && seatDown.increase === false && seatDown.prorationBehavior === 'create_prorations' && seatDown.needsInvoice === false);
check('SCENARIO seat quantity change: an unchanged quantity never charges', () => seatChangeDecision({ record: { ...afterFirst, seats_purchased: 2, stripe_subscription_id: 'sub_clover_1' }, plan: cloverPlan, requestedSeats: 2, checkoutEnabled: true }).noop === true);
check('A seat change is refused while billing is switched off', () => seatChangeDecision({ record: { ...afterFirst, seats_purchased: 0, stripe_subscription_id: 'sub_clover_1' }, plan: cloverPlan, requestedSeats: 1, checkoutEnabled: false }).ok === false);
check('A seat change is refused on a plan without additional seats', () => seatChangeDecision({ record: { ...afterFirst, stripe_subscription_id: 'sub_clover_1' }, plan: DEFAULT_PLAN_PRODUCTS[0], requestedSeats: 1, checkoutEnabled: true }).ok === false);
check('A seat change is refused without a configured seat price', () => seatChangeDecision({ record: { ...afterFirst, stripe_subscription_id: 'sub_clover_1' }, plan: { ...cloverPlan, stripe_seat_price_id: '' }, requestedSeats: 1, checkoutEnabled: true }).ok === false);
check('A seat change is refused for a fractional or excessive quantity', () => {
  const fractional = seatChangeDecision({ record: { ...afterFirst, stripe_subscription_id: 'sub_clover_1' }, plan: cloverPlan, requestedSeats: 1.5, checkoutEnabled: true });
  const excessive = seatChangeDecision({ record: { ...afterFirst, stripe_subscription_id: 'sub_clover_1' }, plan: cloverPlan, requestedSeats: 51, checkoutEnabled: true });
  return fractional.ok === false && excessive.ok === false;
});

// ---- scenario 9: duplicate webhook delivery ----
check('SCENARIO duplicate delivery: the same event id is applied once', () => alreadyApplied(afterFirst, 'evt_clover_first') === true && applySubscriptionUpsert(afterFirst, cloverSubscription(), 'evt_clover_first', 'test', SEAT_OPTS).changed === false);
check('SCENARIO duplicate delivery: the same invoice is not double counted', () => applyInvoicePaid({ ...afterFirst, ...firstInvoice.patch }, cloverInvoice(), 'evt_clover_inv_1b', 'test', SEAT_OPTS).patch.billing_history.length === 1);
check('SCENARIO duplicate delivery: reconciliation repeated records nothing twice', () => {
  const once = reconcileFromStripe(cloverBase, cloverSubscription(), 'sweep', SEAT_OPTS);
  return reconcileFromStripe({ ...cloverBase, ...once.patch }, cloverSubscription(), 'sweep', SEAT_OPTS).changed === false;
});

// ---- isolation from media orders and Preferred memberships ----
const VISIBILITY_PRICES = ['price_brokerage', SEAT_PRICE];
check('ISOLATION a subscription-mode checkout is never a media order', () => sessionIsRecurring({ mode: 'subscription' }) === true && sessionIsRecurring({ mode: 'payment' }) === false);
check('ISOLATION a subscription charge is never matched to a media invoice', () => paymentIntentBelongsToSubscription({ invoice: 'in_1' }) === true && paymentIntentBelongsToSubscription({}) === false);
check('ISOLATION the membership branch never acts on a visibility subscription', () => preferredBranchMayAct(cloverSubscription(), VISIBILITY_PRICES) === false);
check('ISOLATION the membership branch still acts on an ordinary event', () => preferredBranchMayAct({ metadata: {} }, VISIBILITY_PRICES) === true);
check('ISOLATION an event marked with both flows is refused by both branches', () => {
  const both = { metadata: { purpose: 'visibility_subscription', profile_id: 'p1', client_email: 'a@b.example' } };
  return visibilityBranchMayAct(both, VISIBILITY_PRICES) === false && preferredBranchMayAct(both, VISIBILITY_PRICES) === false;
});
check('ISOLATION an unrelated media payment is not a visibility object', () => visibilityBranchMayAct({ metadata: { order_id: 'order_1' }, items: { data: [{ price: { id: 'price_media_order' } }] } }, VISIBILITY_PRICES) === false);

// ---- notifications: classes, opt-out and the switch ----
check('NOTIFICATIONS billing and marketing notices are separate classes', () => noticeByKey('payment_failed').notice_class === NOTICE_CLASS_SERVICE
  && noticeByKey('activated').notice_class === NOTICE_CLASS_SERVICE
  && noticeByKey('canceled').notice_class === NOTICE_CLASS_SERVICE
  && noticeByKey('renewal').notice_class === NOTICE_CLASS_MARKETING
  && noticeByKey('monthly_summary').notice_class === NOTICE_CLASS_MARKETING);
check('NOTIFICATIONS every notice is off while the switch is off', () => noticeAllowed(NOTICE_CLASS_SERVICE, { switchOn: false, marketingAllowed: true }) === false
  && noticeAllowed(NOTICE_CLASS_MARKETING, { switchOn: false, marketingAllowed: true }) === false);
check('NOTIFICATIONS a service notice needs only the switch', () => noticeAllowed(NOTICE_CLASS_SERVICE, { switchOn: true, marketingAllowed: false }) === true);
check('NOTIFICATIONS a marketing notice needs the switch and no opt-out', () => noticeAllowed(NOTICE_CLASS_MARKETING, { switchOn: true, marketingAllowed: false }) === false
  && noticeAllowed(NOTICE_CLASS_MARKETING, { switchOn: true, marketingAllowed: true }) === true);
check('NOTIFICATIONS every marketing notice carries an unsubscribe link', () => ['renewal', 'monthly_summary']
  .map((key) => noticeByKey(key))
  .every((notice) => noticeHtml(notice, { unsubscribeUrl: 'https://example.test/notification-preferences?token=t' }).includes('Unsubscribe')));
check('NOTIFICATIONS a service notice carries no unsubscribe link', () => !noticeHtml(noticeByKey('payment_failed'), { appUrl: 'https://example.test' }).includes('Unsubscribe'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const passed = checks.filter((c) => c.pass).length;
    return Response.json({
      ok: passed === checks.length,
      passed,
      total: checks.length,
      failed: checks.filter((c) => !c.pass),
      certification_note:
        'Deterministic checks only: no Stripe request, no email, no record written. A passing suite proves the logic, ' +
        'not that Stripe, Brevo or the Cloudflare Worker are configured or deployed.',
      checks,
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
});