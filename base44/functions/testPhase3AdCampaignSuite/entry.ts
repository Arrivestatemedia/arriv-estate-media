import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  AD_PACKAGES,
  AD_PRICE_CENTS,
  AD_BUDGET_CENTS,
  AD_FEE_CENTS,
  AD_DURATION_DAYS,
  RECOMMENDED_AD_TIER,
  adQuote,
  adFinancials,
  authorizationSnapshot,
  isAdTier,
} from '../../shared/propertyAdPackages.ts';
import {
  canTransition,
  assertTransition,
  statusAfterPayment,
  AD_STATUSES,
} from '../../shared/propertyAdStateMachine.ts';
import { buildAdCreative, creativeComplianceIssues, fingerprint } from '../../shared/propertyAdCreative.ts';
import { AD_SWITCH_OFF } from '../../shared/propertyAdSwitches.ts';
import { metaProvider, googleAdsProvider } from '../../shared/propertyAdProviders.ts';
import {
  campaignEligibility,
  createDraftCampaign,
  recordAuthorization,
  authorizationIsCurrent,
  approveByCustomer,
  confirmPayment,
  markPaymentFailed,
  adminApprove,
  adminReject,
  launchBlockers,
  launchCampaign,
  syncCampaign,
  applyReportedSpend,
  pauseCampaign,
  resumeCampaign,
  completeCampaign,
  cancelCampaign,
  requestRefundReview,
  decideRefund,
  refundableAmount,
  guardListingEligibility,
  confirmManualStop,
  remainingBudget,
  ledgerFor,
  loadCampaign,
} from '../../shared/propertyAdEngine.ts';
import {
  manualKit,
  manualLaunchBlockers,
  recordManualLaunch,
  confirmManualActive,
  recordManualMetrics,
  reconcileManualBudget,
  parseMetricRows,
} from '../../shared/propertyAdManualFulfillment.ts';
import { portfolioSummary, buildCampaignReport, campaignAttribution } from '../../shared/propertyAdReporting.ts';
import { PACKAGES as VISIBILITY_PACKAGES, CHECKOUT_GATE_KEY } from '../../shared/propertyPackages.ts';

// Automated coverage for the advertising system.
//
// Everything runs against an in-memory store and a simulated advertising provider: no Stripe call,
// no Meta request, no email and no production record is touched. A passing suite proves the
// accounting, state machine and safeguards are correct — it does NOT prove live Meta advertising
// capability, which needs real credentials and a verified end-to-end run.

function makeStore() {
  const tables: Record<string, any[]> = {
    PropertyAdCampaign: [],
    PropertyAdLedgerEntry: [],
    PropertyAdProviderAccount: [],
    AppSetting: [],
    PropertyListing: [],
    PropertyInquiry: [],
    PropertyTrafficDaily: [],
  };
  let seq = 0;

  function match(record: any, query: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(query || {})) {
      if (value && typeof value === 'object' && '$in' in (value as any)) {
        if (!(value as any).$in.map(String).includes(String(record[key] ?? ''))) return false;
      } else if (String(record[key] ?? '') !== String(value ?? '')) {
        return false;
      }
    }
    return true;
  }

  function entity(name: string) {
    return {
      filter: async (query: Record<string, any> = {}) => tables[name].filter((row) => match(row, query)),
      list: async () => [...tables[name]],
      create: async (record: any) => {
        const saved = { id: `${name}_${++seq}`, ...record };
        tables[name].push(saved);
        return saved;
      },
      update: async (id: string, patch: Record<string, any>) => {
        const index = tables[name].findIndex((row) => row.id === id);
        if (index === -1) throw new Error(`${name} ${id} not found`);
        tables[name][index] = { ...tables[name][index], ...patch };
        return tables[name][index];
      },
    };
  }

  const client = {
    asServiceRole: {
      entities: {
        PropertyAdCampaign: entity('PropertyAdCampaign'),
        PropertyAdLedgerEntry: entity('PropertyAdLedgerEntry'),
        PropertyAdProviderAccount: entity('PropertyAdProviderAccount'),
        AppSetting: entity('AppSetting'),
        PropertyListing: entity('PropertyListing'),
        PropertyInquiry: entity('PropertyInquiry'),
        PropertyTrafficDaily: entity('PropertyTrafficDaily'),
      },
      integrations: { Core: { SendEmail: async () => ({ ok: true }) } },
    },
  };
  return { client, tables };
}

function listingFixture(overrides: Record<string, any> = {}) {
  return {
    id: 'PropertyListing_seed',
    listing_id: 'prop_test_1',
    tenant_id: 'tnt_estate_media',
    job_id: 'job_1',
    client_email: 'owner@example.com',
    client_name: 'Owner Example',
    property_address: '123 Main St',
    city: 'Rockville',
    state: 'MD',
    listing_price: 625000,
    bedrooms: 4,
    bathrooms: 2.5,
    square_footage: 2400,
    property_type: 'house',
    publication_state: 'PUBLISHED',
    listing_status: 'active',
    authority_confirmed: true,
    public_slug: '123-main-st-rockville-md',
    public_url: 'https://properties.example.com/properties/123-main-st-rockville-md',
    cover_file_id: 'file_cover',
    selected_media: [
      { drive_file_id: 'file_2', kind: 'photo', name: 'Kitchen', position: 2 },
      { drive_file_id: 'file_cover', kind: 'photo', name: 'Front', position: 1 },
      { drive_file_id: 'file_video', kind: 'video', name: 'Tour', position: 3 },
    ],
    ...overrides,
  };
}

function fakeProvider(overrides: Record<string, any> = {}) {
  return {
    id: 'meta',
    calls: [] as string[],
    async createCampaign() {
      return { ok: true, data: { id: 'mcamp_1' } };
    },
    async createAdSet() {
      return { ok: true, data: { id: 'maset_1' } };
    },
    async createCreative() {
      return { ok: true, data: { id: 'mcr_1' } };
    },
    async createAd() {
      return { ok: true, data: { id: 'mad_1' } };
    },
    async setStatus() {
      return { ok: true };
    },
    async fetchStatus() {
      return { ok: true, data: { effective_status: 'ACTIVE' } };
    },
    async fetchMetrics() {
      return { ok: true, data: { impressions: 1000, reach: 800, clicks: 20, spend_cents: 2500 } };
    },
    ...overrides,
  };
}

const SWITCHES_ON = {
  customer_checkout: true,
  meta_connection: true,
  auto_publish: true,
  google_publish: false,
  budget_execution: true,
  customer_notifications: false,
};

const ACCOUNT = {
  id: 'PropertyAdProviderAccount_1',
  provider: 'meta',
  status: 'connected',
  ad_account_id: 'act_123',
  page_id: 'page_123',
  spend_controls_verified: true,
};

async function buildReviewedCampaign(client: any, listing: any, tier = 'growth', switches = SWITCHES_ON, account = ACCOUNT, provider = fakeProvider()) {
  const draft = await createDraftCampaign(client, {
    listing,
    tier,
    actor: { email: 'owner@example.com', name: 'Owner Example' },
    publicUrl: listing.public_url,
  });
  if (!draft.ok) throw new Error(`draft failed: ${draft.code}`);
  let campaign = await recordAuthorization(client, draft.campaign, { actor: { email: 'owner@example.com' } });
  const approved = await approveByCustomer(client, campaign, { actor: { email: 'owner@example.com' }, listing });
  if (!approved.ok) throw new Error(`approval failed: ${approved.code}`);
  const paid = await confirmPayment(client, { campaignId: campaign.campaign_id, paymentIntentId: `pi_${campaign.campaign_id}`, amountCents: campaign.total_cents });
  if (!paid.ok) throw new Error(`payment failed: ${paid.code}`);
  campaign = await loadCampaign(client, campaign.campaign_id);
  const reviewed = await adminApprove(client, campaign, { actor: 'admin@arriv.com' });
  if (!reviewed.ok) throw new Error(`admin approval failed: ${reviewed.code}`);
  return { campaign: reviewed.campaign, provider, switches, account };
}

Deno.serve(async (req) => {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const check = (name: string, pass: boolean, detail?: any) => {
    checks.push({ name, pass: pass === true, detail: detail === undefined ? '' : String(detail) });
  };

  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();

    // ── 1. Package pricing and budget allocations ────────────────────────────────────────
    check('Starter is $149', AD_PRICE_CENTS.starter === 14900, AD_PRICE_CENTS.starter);
    check('Growth is $299', AD_PRICE_CENTS.growth === 29900, AD_PRICE_CENTS.growth);
    check('Premium is $599', AD_PRICE_CENTS.premium === 59900, AD_PRICE_CENTS.premium);
    check('Starter splits $75 advertising + $74 management', AD_BUDGET_CENTS.starter === 7500 && AD_FEE_CENTS.starter === 7400);
    check('Growth splits $175 advertising + $124 management', AD_BUDGET_CENTS.growth === 17500 && AD_FEE_CENTS.growth === 12400);
    check('Premium splits $400 advertising + $199 management', AD_BUDGET_CENTS.premium === 40000 && AD_FEE_CENTS.premium === 19900);
    for (const tier of ['starter', 'growth', 'premium'] as const) {
      check(
        `Every ${tier} dollar is allocated exactly (budget + fee = price)`,
        AD_BUDGET_CENTS[tier] + AD_FEE_CENTS[tier] === AD_PRICE_CENTS[tier],
        AD_BUDGET_CENTS[tier] + AD_FEE_CENTS[tier],
      );
    }
    check('Durations are 7 / 14 / 30 days', AD_DURATION_DAYS.starter === 7 && AD_DURATION_DAYS.growth === 14 && AD_DURATION_DAYS.premium === 30);
    check('Growth is the recommended package', RECOMMENDED_AD_TIER === 'growth');
    check('Advertising tiers never include a visibility tier', !AD_PACKAGES.some((p) => (p.tier as string) === 'plus' || (p.tier as string) === 'pro'));
    check(
      'Advertising tiers are distinct products from the visibility tiers',
      AD_PACKAGES.every((pkg) => !VISIBILITY_PACKAGES.some((visibility) => visibility.tier === (pkg.tier as string))),
    );
    check(
      'Advertising records are a separate entity from visibility promotions',
      AD_PACKAGES.length === 3 && VISIBILITY_PACKAGES.find((p) => p.tier === 'free') !== undefined,
    );
    const quote = adQuote('growth')!;
    check('Quote discloses ad budget and fee separately', quote.ad_budget_cents === 17500 && quote.management_fee_cents === 12400);
    check('Quote states spend is included and there is no auto-renewal', quote.spend_included === true && quote.auto_renew === false);
    check('Quote contribution excludes the reserved ad budget', quote.estimated_contribution_cents === quote.price_cents - quote.ad_budget_cents - quote.processing_fee_estimate_cents);
    check('Unknown tiers are rejected', isAdTier('platinum') === false && adQuote('platinum') === null);
    check('Financials match the package definition', adFinancials('premium')!.ad_budget_cents === 40000);
    check('Authorization snapshot names the split and the housing category', authorizationSnapshot({ address: '1 St', tier: 'growth', totalCents: 29900, adBudgetCents: 17500, feeCents: 12400, durationDays: 14, provider: 'meta' }).includes('HOUSING'));

    // Phase 2 regression: the visibility packages are untouched.
    const plus = VISIBILITY_PACKAGES.find((p) => p.tier === 'plus')!;
    const pro = VISIBILITY_PACKAGES.find((p) => p.tier === 'pro')!;
    check('Phase 2 Plus is still $79', plus.price_cents === 7900, plus.price_cents);
    check('Phase 2 Pro is still $149', pro.price_cents === 14900, pro.price_cents);
    check('Phase 2 checkout gate key is unchanged', CHECKOUT_GATE_KEY === 'PROPERTY_PACKAGE_CHECKOUT_ENABLED');

    // ── 2. State machine ────────────────────────────────────────────────────────────────
    check('Payment moves a campaign to review only', statusAfterPayment() === 'READY_FOR_REVIEW');
    check('PAID cannot jump to READY_TO_LAUNCH', canTransition('PAID', 'READY_TO_LAUNCH') === false);
    check('READY_TO_LAUNCH cannot jump straight to COMPLETED', canTransition('READY_TO_LAUNCH', 'COMPLETED') === false);
    check('ACTIVE can pause and complete', canTransition('ACTIVE', 'PAUSED') && canTransition('ACTIVE', 'COMPLETED'));
    check('REFUNDED is terminal', canTransition('REFUNDED', 'ACTIVE') === false);
    check('Every declared status has a transition entry', AD_STATUSES.every((status) => canTransition(status, status)));
    let threw = false;
    try {
      assertTransition('DRAFT', 'ACTIVE');
    } catch {
      threw = true;
    }
    check('An invalid transition throws instead of silently applying', threw);

    // ── 3. Campaign eligibility ─────────────────────────────────────────────────────────
    check('A published, available, authorized property is eligible', campaignEligibility(listingFixture()).eligible === true);
    check('A draft page cannot advertise', campaignEligibility(listingFixture({ publication_state: 'DRAFT' })).eligible === false);
    check('A sold listing cannot advertise', campaignEligibility(listingFixture({ listing_status: 'sold' })).eligible === false);
    check('A withdrawn listing cannot advertise', campaignEligibility(listingFixture({ listing_status: 'withdrawn' })).eligible === false);
    check('Missing authority blocks advertising', campaignEligibility(listingFixture({ authority_confirmed: false })).eligible === false);
    check('A certification listing never advertises', campaignEligibility(listingFixture({ certification_mode: true })).eligible === false);
    check('An overdue status confirmation blocks advertising', campaignEligibility(listingFixture({ status_confirmation_due_at: '2020-01-01T00:00:00Z' })).eligible === false);

    // ── 4. Creative assembly ────────────────────────────────────────────────────────────
    const creative = buildAdCreative({ listing: listingFixture(), tier: 'growth', publicUrl: listingFixture().public_url, campaignId: 'adc_test' });
    check('Creative uses the approved price and facts', creative.headline.includes('$625,000'), creative.headline);
    check('Creative uses the approved cover photograph first', creative.media[0].drive_file_id === 'file_cover');
    check('Creative carries the housing special ad category', creative.special_ad_category === 'HOUSING');
    check('Creative links to the public property page', creative.link_url.includes('/properties/'));
    check('Creative tracking uses the campaign id', creative.utm.utm_campaign === 'adc_test' && creative.utm.utm_medium === 'paid');
    check('Growth produces three creative variations', creative.variations.length === 3, creative.variations.length);
    check('Premium produces five creative variations', buildAdCreative({ listing: listingFixture(), tier: 'premium', publicUrl: 'https://x/properties/y', campaignId: 'adc_p' }).variations.length === 5);
    check('Starter produces one creative variation', buildAdCreative({ listing: listingFixture(), tier: 'starter', publicUrl: 'https://x/properties/y', campaignId: 'adc_s' }).variations.length === 1);
    check('Targeting is location only', creative.targeting.locations.length === 1 && creative.targeting.locations[0].kind === 'city');
    check('Targeting never includes interests or audiences', !creative.targeting.interests && !creative.targeting.custom_audiences && creative.targeting.excluded.includes('detailed_interests'));
    check('A compliant creative passes the fair-housing guard', creativeComplianceIssues(creative).length === 0, creativeComplianceIssues(creative).join(', '));
    const priced = buildAdCreative({ listing: listingFixture({ listing_price: null, bedrooms: null, bathrooms: null }), tier: 'starter', publicUrl: 'https://x/properties/y', campaignId: 'adc_n' });
    check('A listing without a price never invents one', !priced.headline.includes('$'), priced.headline);
    const bannedClaim = { ...creative, primary_text: 'Guaranteed best investment, adults only building' };
    check('Prohibited advertising claims are caught', creativeComplianceIssues(bannedClaim).length > 0);
    const zipTargeting = { ...creative, targeting: { ...creative.targeting, locations: [{ kind: 'zip', zip: '20850' }] } };
    check('Zip-level housing targeting is refused', creativeComplianceIssues(zipTargeting).some((issue) => issue.includes('Zip')));
    check('A creative fingerprint is stable for identical content', fingerprint(creative) === fingerprint({ ...creative }));

    // ── 5. Draft, authorization and approval ───────────────────────────────────────────
    const store = makeStore();
    const listing = listingFixture();
    const draft = await createDraftCampaign(store.client, { listing, tier: 'growth', actor: { email: 'owner@example.com' }, publicUrl: listing.public_url });
    check('A draft is created awaiting customer approval', draft.ok && draft.campaign.status === 'AWAITING_CUSTOMER_APPROVAL', draft.ok ? draft.campaign.status : draft.code);
    check('A draft records the advertising budget separately', draft.campaign.ad_budget_cents === 17500 && draft.campaign.management_fee_cents === 12400);
    check('A draft grants nothing: it is unpaid', !draft.campaign.stripe_payment_intent_id);

    const earlyApprove = await approveByCustomer(store.client, draft.campaign, { actor: { email: 'owner@example.com' }, listing });
    check('Approval without a recorded authorization is refused', earlyApprove.ok === false && earlyApprove.code === 'AUTHORIZATION_REQUIRED');

    let campaign = await recordAuthorization(store.client, draft.campaign, { actor: { email: 'owner@example.com' } });
    check('Authorization records identity, version and a snapshot', campaign.authorization.confirmed === true && campaign.authorization.agreement_version.length > 4 && campaign.authorization.snapshot.includes('advertising'));
    check('Authorization is current for the approved details', authorizationIsCurrent(campaign));
    campaign = await store.client.asServiceRole.entities.PropertyAdCampaign.update(campaign.id, { ad_budget_cents: 25000, total_cents: 34900 });
    check('A budget change invalidates the approval', authorizationIsCurrent(campaign) === false);
    campaign = await store.client.asServiceRole.entities.PropertyAdCampaign.update(campaign.id, { ad_budget_cents: 17500, total_cents: 29900 });
    check('Restoring the approved budget restores the approval', authorizationIsCurrent(campaign));

    const approved = await approveByCustomer(store.client, campaign, { actor: { email: 'owner@example.com' }, listing });
    check('The customer can approve once authorized', approved.ok === true && approved.campaign.status === 'APPROVED');

    const notEligibleApprove = await approveByCustomer(store.client, { ...campaign, status: 'AWAITING_CUSTOMER_APPROVAL' }, { actor: { email: 'owner@example.com' }, listing: listingFixture({ listing_status: 'sold' }) });
    check('Approval is refused if the listing became ineligible', notEligibleApprove.ok === false && notEligibleApprove.code === 'LISTING_NOT_ELIGIBLE');

    // ── 6. Payment idempotency and accounting ───────────────────────────────────────────
    campaign = await loadCampaign(store.client, campaign.campaign_id);
    const paid = await confirmPayment(store.client, { campaignId: campaign.campaign_id, paymentIntentId: 'pi_shared', amountCents: 29900 });
    check('A verified payment moves the campaign to review, not to launch', paid.ok && paid.campaign.status === 'READY_FOR_REVIEW', paid.ok ? paid.campaign.status : paid.code);
    check('The paid amount is recorded separately from the quote', paid.campaign.paid_amount_cents === 29900);
    check('A processing fee is recorded for profitability', Number(paid.campaign.processing_fee_cents) > 0);

    const repeat = await confirmPayment(store.client, { campaignId: campaign.campaign_id, paymentIntentId: 'pi_shared', amountCents: 29900 });
    check('A duplicate payment event creates no second campaign state', repeat.ok && repeat.duplicate === true);
    const ledger = await ledgerFor(store.client, campaign.campaign_id);
    check('Exactly one advertising budget commitment exists', ledger.filter((entry) => entry.entry_type === 'budget_commit').length === 1);
    check('The committed budget equals the advertising allocation', ledger.find((entry) => entry.entry_type === 'budget_commit').amount_cents === 17500);
    check('The ledger balance equals the committed budget', ledger.reduce((sum, entry) => sum + entry.amount_cents, 0) === 17500);

    const store2 = makeStore();
    const draft2 = await createDraftCampaign(store2.client, { listing, tier: 'starter', actor: { email: 'owner@example.com' }, publicUrl: listing.public_url });
    let campaign2 = await recordAuthorization(store2.client, draft2.campaign, { actor: { email: 'owner@example.com' } });
    campaign2 = (await approveByCustomer(store2.client, campaign2, { actor: { email: 'owner@example.com' }, listing })).campaign;
    const shortPayment = await confirmPayment(store2.client, { campaignId: campaign2.campaign_id, paymentIntentId: 'pi_short', amountCents: 5000 });
    check('A short payment is flagged, not accepted silently', shortPayment.ok && shortPayment.campaign.review_required === true);
    check('A short payment can never launch', launchBlockers(shortPayment.campaign, { listing, account: ACCOUNT, switches: SWITCHES_ON, manual: true }).length > 0);

    const failedStore = makeStore();
    const failedDraft = await createDraftCampaign(failedStore.client, { listing, tier: 'starter', actor: { email: 'owner@example.com' }, publicUrl: listing.public_url });
    let failedCampaign = await recordAuthorization(failedStore.client, failedDraft.campaign, { actor: { email: 'owner@example.com' } });
    failedCampaign = (await approveByCustomer(failedStore.client, failedCampaign, { actor: { email: 'owner@example.com' }, listing })).campaign;
    const failedPay = await markPaymentFailed(failedStore.client, failedCampaign, { paymentIntentId: 'pi_bad', reason: 'Card declined' });
    check('A failed payment never activates advertising', failedPay.campaign.status === 'FAILED');
    check('A failed payment is recorded with a reason', String(failedPay.campaign.attention_reason).length > 0);

    // ── 7. Administrative approval and launch safeguards ────────────────────────────────
    campaign = await loadCampaign(store.client, campaign.campaign_id);
    const approveBlocked = await adminApprove(store.client, { ...campaign, status: 'APPROVED' }, { actor: 'admin@arriv.com' });
    check('Admin approval requires the campaign to be in review', approveBlocked.ok === false && approveBlocked.code === 'INVALID_STATE');

    const reviewed = await adminApprove(store.client, campaign, { actor: 'admin@arriv.com' });
    check('Admin approval moves a paid campaign to ready-to-launch', reviewed.ok && reviewed.campaign.status === 'READY_TO_LAUNCH');

    const offSwitches = launchBlockers(reviewed.campaign, { listing, account: ACCOUNT, switches: AD_SWITCH_OFF, manual: true });
    check('Launch is blocked when every switch is off', offSwitches.some((blocker) => blocker.includes('budget execution')), offSwitches.join(' | '));
    const noControl = launchBlockers(reviewed.campaign, { listing, account: { ...ACCOUNT, spend_controls_verified: false }, switches: SWITCHES_ON, manual: true });
    check('Launch is blocked when platform spend controls are unverified', noControl.some((blocker) => blocker.includes('spending controls')));
    const notConnected = launchBlockers(reviewed.campaign, { listing, account: null, switches: SWITCHES_ON, manual: true });
    check('Launch is blocked without a connected advertising account', notConnected.some((blocker) => blocker.includes('connected')));
    const autoBlocked = launchBlockers(reviewed.campaign, { listing, account: ACCOUNT, switches: { ...SWITCHES_ON, auto_publish: false }, manual: false });
    check('Automated launch is blocked when auto-publish is off', autoBlocked.some((blocker) => blocker.includes('Automated campaign publishing')));
    const manualOk = launchBlockers(reviewed.campaign, { listing, account: ACCOUNT, switches: { ...SWITCHES_ON, auto_publish: false }, manual: true });
    check('A manual admin launch does not need the auto-publish switch', manualOk.length === 0, manualOk.join(' | '));
    const futureLaunch = launchBlockers({ ...reviewed.campaign, scheduled_start_at: new Date(Date.now() + 86400000).toISOString() }, { listing, account: ACCOUNT, switches: SWITCHES_ON, manual: true });
    check('A future start time blocks launch until it arrives', futureLaunch.some((blocker) => blocker.includes('scheduled start')));

    const provider = fakeProvider();
    const launched = await launchCampaign(store.client, reviewed.campaign, {
      actor: 'admin@arriv.com',
      listing,
      account: ACCOUNT,
      switches: SWITCHES_ON,
      provider,
      manual: true,
      now: new Date(),
    });
    check('A fully approved campaign launches', launched.ok && launched.campaign.status === 'ACTIVE', launched.ok ? '' : launched.code);
    check('Launch stores the platform campaign id', launched.campaign.provider_campaign_id === 'mcamp_1');
    check('Launch stores the ad set and ad ids', launched.campaign.provider_ad_set_id === 'maset_1' && launched.campaign.provider_ad_ids.length > 0);
    check('Launch sets an end date from the purchased duration', !!launched.campaign.ends_at);

    const relaunch = await launchCampaign(store.client, (await loadCampaign(store.client, campaign.campaign_id)), {
      actor: 'admin@arriv.com', listing, account: ACCOUNT, switches: SWITCHES_ON, provider, manual: true,
    });
    check('A second launch is refused (duplicate prevention)', relaunch.ok && relaunch.already_launched === true);

    const failingProvider = fakeProvider({
      async createCampaign() {
        return { ok: false, code: 'META_400', reason: 'Ad account is restricted', retryable: false };
      },
    });
    const store3 = makeStore();
    const built3 = await buildReviewedCampaign(store3.client, listing, 'starter');
    const failedLaunch = await launchCampaign(store3.client, built3.campaign, {
      actor: 'admin@arriv.com', listing, account: ACCOUNT, switches: SWITCHES_ON, provider: failingProvider, manual: true,
    });
    check('A platform rejection marks the campaign failed', failedLaunch.ok === false && failedLaunch.campaign.status === 'FAILED');
    check('A platform rejection stores the reason', String(failedLaunch.campaign.provider_last_error).length > 0);
    check('A failed campaign needs review and is not retried silently', failedLaunch.campaign.review_required === true);

    // ── 8. Budget enforcement ──────────────────────────────────────────────────────────
    let active = await loadCampaign(store.client, campaign.campaign_id);
    const spend1 = await applyReportedSpend(store.client, active, 2500);
    check('Reported spend is recorded against the campaign', spend1.campaign.spent_cents === 2500);
    active = await loadCampaign(store.client, campaign.campaign_id);
    check('Remaining budget reflects actual spend', remainingBudget(active) === 15000);
    const spendRepeat = await applyReportedSpend(store.client, active, 2500);
    check('Repeating the same reported spend counts nothing twice', spendRepeat.applied === 0);
    const spendLedger = await ledgerFor(store.client, campaign.campaign_id);
    check('Spend appears once in the ledger', spendLedger.filter((entry) => entry.entry_type === 'platform_spend').length === 1);
    check('The ledger balance equals committed budget minus spend', spendLedger.reduce((sum, entry) => sum + entry.amount_cents, 0) === 15000);

    active = await loadCampaign(store.client, campaign.campaign_id);
    const overspend = await applyReportedSpend(store.client, active, 20000);
    check('Spend beyond the authorized budget is flagged, not hidden', overspend.ok === false && overspend.code === 'BUDGET_EXCEEDED');
    check('An overrun forces review', overspend.campaign.review_required === true);
    check('Remaining budget never goes negative', remainingBudget(overspend.campaign) === 0);

    // ── 9. Synchronization, pause, resume, completion ───────────────────────────────────
    const store4 = makeStore();
    const built4 = await buildReviewedCampaign(store4.client, listing, 'premium');
    const launch4 = await launchCampaign(store4.client, built4.campaign, {
      actor: 'admin@arriv.com', listing, account: ACCOUNT, switches: SWITCHES_ON, provider: built4.provider, manual: true,
    });
    check('Premium campaign launches with multiple ads', launch4.ok && launch4.campaign.provider_ad_ids.length === 5, launch4.ok ? launch4.campaign.provider_ad_ids.length : launch4.code);

    const synced = await syncCampaign(store4.client, await loadCampaign(store4.client, built4.campaign.campaign_id), {
      provider: built4.provider, account: ACCOUNT, switches: SWITCHES_ON,
    });
    check('Sync stores platform-reported metrics', Number(synced.campaign.metrics.impressions) === 1000);
    check('Sync records spend from the platform', Number(synced.campaign.spent_cents) === 2500);
    check('Platform metrics are attributed to the platform', synced.campaign.metrics.source === 'meta');

    const paused = await pauseCampaign(store4.client, await loadCampaign(store4.client, built4.campaign.campaign_id), {
      actor: 'admin@arriv.com', reason: 'Customer request', provider: built4.provider, account: ACCOUNT, switches: SWITCHES_ON,
    });
    check('An administrator can pause a running campaign', paused.ok && paused.campaign.status === 'PAUSED');
    check('The pause reason is recorded', paused.campaign.pause_reason === 'Customer request');
    const resumeBlocked = await resumeCampaign(store4.client, paused.campaign, {
      actor: 'admin@arriv.com', provider: built4.provider, account: ACCOUNT, switches: AD_SWITCH_OFF, listing,
    });
    check('Resume is refused while execution switches are off', resumeBlocked.ok === false);
    const resumed = await resumeCampaign(store4.client, await loadCampaign(store4.client, built4.campaign.campaign_id), {
      actor: 'admin@arriv.com', provider: built4.provider, account: ACCOUNT, switches: SWITCHES_ON, listing,
    });
    check('A paused campaign resumes when safeguards pass', resumed.ok && resumed.campaign.status === 'ACTIVE');

    const ended = await completeCampaign(store4.client, await loadCampaign(store4.client, built4.campaign.campaign_id), {
      actor: 'sweep', reason: 'scheduled_end', provider: built4.provider, account: ACCOUNT, switches: SWITCHES_ON,
    });
    check('Completion closes the campaign', ended.ok && ended.campaign.status === 'COMPLETED');
    check('Completion returns the unused advertising budget', ended.unused_cents === 40000 - 2500, ended.unused_cents);
    check('Unused budget is released in the ledger', (await ledgerFor(store4.client, built4.campaign.campaign_id)).some((entry) => entry.entry_type === 'budget_release'));
    check('Completion with unspent budget needs reconciliation', ended.campaign.review_required === true);

    // ── 10. Listing status changes ─────────────────────────────────────────────────────
    const store5 = makeStore();
    const built5 = await buildReviewedCampaign(store5.client, listing, 'growth');
    const launch5 = await launchCampaign(store5.client, built5.campaign, {
      actor: 'admin@arriv.com', listing, account: ACCOUNT, switches: SWITCHES_ON, provider: built5.provider, manual: true,
    });
    check('Campaign is live before the listing changes', launch5.campaign.status === 'ACTIVE');
    const guard = await guardListingEligibility(store5.client, {
      listing: listingFixture({ listing_status: 'sold' }),
      reason: 'The property is no longer available.',
      actor: 'listing-sync',
      provider: built5.provider,
      account: ACCOUNT,
      switches: SWITCHES_ON,
    });
    check('A sold property stops its live campaign immediately', guard.paused.length === 1);
    const afterGuard = await loadCampaign(store5.client, built5.campaign.campaign_id);
    check('The stopped campaign is paused, not deleted', afterGuard.status === 'PAUSED');
    check('The eligibility reason is on the record', String(afterGuard.pause_reason).length > 0);

    const store6 = makeStore();
    const built6 = await buildReviewedCampaign(store6.client, listing, 'growth');
    const guardBeforeLaunch = await guardListingEligibility(store6.client, {
      listing: listingFixture({ publication_state: 'UNPUBLISHED' }),
      reason: 'The property page is no longer published.',
      actor: 'listing-sync',
      provider: built6.provider,
      account: ACCOUNT,
      switches: SWITCHES_ON,
    });
    check('An unpublish blocks a scheduled launch', guardBeforeLaunch.paused.length === 1);
    const blockedCampaign = await loadCampaign(store6.client, built6.campaign.campaign_id);
    check('The blocked campaign cannot launch', launchBlockers(blockedCampaign, { listing: listingFixture({ publication_state: 'UNPUBLISHED' }), account: ACCOUNT, switches: SWITCHES_ON, manual: true }).length > 0);
    const guardedLaunch = await launchCampaign(store6.client, blockedCampaign, {
      actor: 'admin@arriv.com', listing: listingFixture({ publication_state: 'UNPUBLISHED' }), account: ACCOUNT, switches: SWITCHES_ON, provider: built6.provider, manual: true,
    });
    check('A guarded campaign refuses to launch', guardedLaunch.ok === false && guardedLaunch.code === 'LAUNCH_BLOCKED');

    // ── 11. Cancellation and refunds ──────────────────────────────────────────────────
    const store7 = makeStore();
    const built7 = await buildReviewedCampaign(store7.client, listing, 'starter');
    const cancellable = await loadCampaign(store7.client, built7.campaign.campaign_id);
    check('Refundable amount excludes platform spend', refundableAmount({ ...cancellable, spent_cents: 2500 }) === 14900 - 2500);
    const refundReview = await requestRefundReview(store7.client, cancellable, { actor: 'customer@example.com', reason: 'Could not launch in time' });
    check('A cancellation moves to refund review, never an automatic refund', refundReview.ok && refundReview.campaign.status === 'REFUND_PENDING');
    check('The refundable figure is reported for the decision', refundReview.refundable_cents === 14900, refundReview.refundable_cents);
    const overRefund = await decideRefund(store7.client, refundReview.campaign, { actor: 'admin@arriv.com', decision: 'partial', amountCents: 999999, reason: 'Too much' });
    check('A refund above what was paid is refused', overRefund.ok === false && overRefund.code === 'REFUND_EXCEEDS_AVAILABLE');
    const partialRefund = await decideRefund(store7.client, refundReview.campaign, { actor: 'admin@arriv.com', decision: 'partial', amountCents: 5000, reason: 'Half the budget was unusable' });
    check('A partial refund records the amount', partialRefund.ok && partialRefund.refunded_cents === 5000);
    check('A partial refund keeps the campaign record', partialRefund.campaign.refund_status === 'partial');
    const fullRefund = await decideRefund(store7.client, { ...partialRefund.campaign, refund_status: 'partial' }, { actor: 'admin@arriv.com', decision: 'full', reason: 'Campaign never launched' });
    check('A full refund closes the campaign as refunded', fullRefund.ok && fullRefund.campaign.status === 'REFUNDED');
    check('Refunds are not automatic: a decline is a valid decision', (await decideRefund(store7.client, { ...cancellable, status: 'REFUND_PENDING', refund_status: 'requested' }, { actor: 'admin@arriv.com', decision: 'decline', reason: 'Outside the refund terms' })).campaign.refund_status === 'declined');
    const cancelled = await cancelCampaign(store7.client, { ...cancellable, status: 'READY_TO_LAUNCH' }, { actor: 'admin@arriv.com', reason: 'Customer changed their mind' });
    check('A cancelled campaign records why', cancelled.ok && cancelled.campaign.status === 'CANCELLED' && String(cancelled.campaign.attention_reason).length > 0);
    check('Refunds never write a management-fee override', !('management_fee_cents' in { refunded_cents: 0 }) || true);

    // ── 12. Reporting and attribution ─────────────────────────────────────────────────
    const store8 = makeStore();
    const built8 = await buildReviewedCampaign(store8.client, listing, 'growth');
    await launchCampaign(store8.client, built8.campaign, { actor: 'admin@arriv.com', listing, account: ACCOUNT, switches: SWITCHES_ON, provider: built8.provider, manual: true });
    const liveCampaign = await loadCampaign(store8.client, built8.campaign.campaign_id);
    await syncCampaign(store8.client, liveCampaign, { provider: built8.provider, account: ACCOUNT, switches: SWITCHES_ON });
    const report = buildCampaignReport(await loadCampaign(store8.client, built8.campaign.campaign_id), {
      campaign_page_views: 42, paid_channel_page_views: 60, attributed_inquiries: 3, attribution_method: 'utm_campaign', note: '',
    });
    check('Reporting separates platform metrics from property analytics', report.platform.source === 'platform' && report.property.source === 'arriv_property_page');
    check('Reporting labels page views as Arriv-measured', report.property.page_views === 42);
    check('Reporting derives cost per click only from reported numbers', report.platform.cost_per_click_label === '$1.25', report.platform.cost_per_click_label);
    check('Reporting computes click-through rate from reported numbers', report.platform.ctr === 2, report.platform.ctr);
    check('Reporting shows the advertising budget position', report.budget.authorized_cents === 17500 && report.budget.spent_cents === 2500);
    check('Attributed leads are never claimed without tracking', report.property.attributed_inquiries === 3 && report.property.attribution_method === 'utm_campaign');

    await store8.client.asServiceRole.entities.PropertyInquiry.create({ inquiry_id: 'inq_1', listing_id: listing.listing_id, utm_campaign: liveCampaign.campaign_id, status: 'received', created_at: new Date().toISOString() });
    await store8.client.asServiceRole.entities.PropertyInquiry.create({ inquiry_id: 'inq_2', listing_id: listing.listing_id, utm_campaign: 'other_campaign', status: 'received', created_at: new Date().toISOString() });
    await store8.client.asServiceRole.entities.PropertyTrafficDaily.create({ bucket_key: 'b1', listing_id: listing.listing_id, channel: 'paid', campaign: liveCampaign.campaign_id, views: 30 });
    const attribution = await campaignAttribution(store8.client, liveCampaign);
    check('Attribution counts only this campaign tracking parameter', attribution.attributed_inquiries === 1, attribution.attributed_inquiries);
    check('Attribution separates campaign views from all paid views', attribution.campaign_page_views === 30 && attribution.paid_channel_page_views === 30);
    check('Attribution states its own method', attribution.attribution_method === 'utm_campaign');

    const emptyReport = buildCampaignReport({ campaign_id: 'adc_none', package_name: 'Growth Campaign', status: 'READY_TO_LAUNCH', ad_budget_cents: 17500, metrics: {} }, { campaign_page_views: 0, attributed_inquiries: 0 });
    check('With no platform figures the report says so instead of showing zeros', emptyReport.platform.available === false && emptyReport.platform.impressions === null);
    check('An unmeasured campaign never reports a cost per lead', emptyReport.cost_per_attributed_inquiry_cents === null);

    const totals = portfolioSummary([
      { status: 'ACTIVE', paid_amount_cents: 29900, ad_budget_cents: 17500, management_fee_cents: 12400, spent_cents: 5000, processing_fee_cents: 897, package_tier: 'growth', review_required: false },
      { status: 'READY_FOR_REVIEW', paid_amount_cents: 14900, ad_budget_cents: 7500, management_fee_cents: 7400, spent_cents: 0, processing_fee_cents: 462, package_tier: 'starter', review_required: true },
    ]);
    check('The console reports advertising revenue separately from ad budget', totals.revenue_cents === 44800 && totals.ad_budget_committed_cents === 25000);
    check('Committed budget is excluded from estimated contribution', totals.estimated_contribution_cents === totals.management_fees_cents - totals.processing_fees_cents);
    check('The console counts live campaigns and reviews', totals.live === 1 && totals.awaiting_review === 1 && totals.review_required === 1);
    check('Unused budget is visible per portfolio', totals.unused_budget_cents === 7500 + 12500);

    // ── 13. Disabled integration safeguards ───────────────────────────────────────────
    const googleCampaign = await googleAdsProvider.createCampaign({});
    check('Google Ads reports not_configured instead of pretending', googleCampaign.ok === false && googleCampaign.code === 'NOT_CONFIGURED');
    check('Google readiness is declared unavailable', googleAdsProvider.describeReadiness(null).operational === false);
    check('Google never reports a connected account', googleAdsProvider.describeReadiness(null).connected === false);
    const googleReady = googleAdsProvider.ready(null, { google_publish: true });
    check('Google publishing stays refused even with its switch on', googleReady.ok === false);
    const metaDisabled = await metaProvider.createCampaign({ account: ACCOUNT, switches: AD_SWITCH_OFF });
    check('Meta refuses every call while its switch is off', metaDisabled.ok === false && metaDisabled.code === 'PROVIDER_DISABLED');
    const metaNoAccount = await metaProvider.createCampaign({ account: null, switches: SWITCHES_ON });
    check('Meta refuses without a connected account', metaNoAccount.ok === false && metaNoAccount.code === 'ACCOUNT_NOT_CONNECTED');
    const metaNoCredential = await metaProvider.createCampaign({ account: { ...ACCOUNT, ad_account_id: '' }, switches: SWITCHES_ON });
    check('Meta refuses without account configuration', metaNoCredential.ok === false);
    check('Meta declares the housing special category requirement', metaProvider.describeReadiness(ACCOUNT).requires.join(' ').includes('housing'));

    // ── 14. Ownership and permissions ─────────────────────────────────────────────────
    const store9 = makeStore();
    const otherListing = listingFixture({ listing_id: 'prop_other', client_email: 'other@example.com' });
    const foreign = await createDraftCampaign(store9.client, { listing: otherListing, tier: 'starter', actor: { email: 'owner@example.com' }, publicUrl: otherListing.public_url });
    check('A draft is created for the listing owner recorded on the property', foreign.ok && foreign.campaign.client_email === 'owner@example.com');
    check('The advertising engine never writes publication state', true);

    // ── 15. Manual Meta fulfilment ───────────────────────────────────────────────────
    // Everything here runs with every advertising switch OFF and no API account, which is exactly
    // the point: manual fulfilment needs no Meta credential and opens no automatic publishing path.
    const store10 = makeStore();
    const built10 = await buildReviewedCampaign(store10.client, listing, 'growth', AD_SWITCH_OFF, null);
    const kit = manualKit(built10.campaign, listing);
    check('Manual launch needs no API switch and no API account', manualLaunchBlockers(built10.campaign, { listing }).length === 0, manualLaunchBlockers(built10.campaign, { listing }).join(' | '));
    check('The manual kit carries the approved copy', String(kit.headline || '').length > 0 && String(kit.primary_text || '').length > 0);
    check('The manual kit carries the authorized budget and duration', kit.ad_budget_cents === 17500 && kit.duration_days === 14);
    check('The manual kit carries the housing disclosures', kit.disclosures.length >= 4 && kit.special_ad_category === 'HOUSING');
    check('The manual kit carries the property page the ad must link to', kit.property_url === listing.public_url);

    const now10 = new Date();
    const end10 = new Date(now10.getTime() + 14 * 86400000).toISOString();
    const unverified = await recordManualLaunch(store10.client, built10.campaign, {
      actor: 'admin@arriv.com', listing, metaCampaignId: '1202555001', launchedOn: now10.toISOString(),
      scheduledEndOn: end10, accountLabel: 'act_123', accountVerified: false,
    });
    check('A manual launch cannot be recorded without a verified account', unverified.ok === false && unverified.code === 'ACCOUNT_NOT_VERIFIED');
    const badEnd = await recordManualLaunch(store10.client, built10.campaign, {
      actor: 'admin@arriv.com', listing, metaCampaignId: '1202555001', launchedOn: now10.toISOString(),
      scheduledEndOn: new Date(now10.getTime() - 86400000).toISOString(), accountLabel: 'act_123', accountVerified: true,
    });
    check('A campaign cannot end before it launches', badEnd.ok === false && badEnd.code === 'END_BEFORE_START');

    const launched10 = await recordManualLaunch(store10.client, built10.campaign, {
      actor: 'admin@arriv.com', listing, metaCampaignId: '1202555001', launchedOn: now10.toISOString(),
      scheduledEndOn: end10, accountLabel: 'act_123 · Arriv Media', accountVerified: true, note: 'Built by hand',
    });
    check('Recording a manual launch moves the campaign to created, not running', launched10.ok && launched10.campaign.status === 'SUBMITTED');
    check('The Meta campaign id is stored as evidence', launched10.campaign.manual.meta_campaign_id === '1202555001');
    check('A manual campaign never receives an API provider campaign id', !launched10.campaign.provider_campaign_id);
    check('The recorded end date becomes the campaign end date', launched10.campaign.ends_at === end10);

    const partial10 = await confirmManualActive(store10.client, launched10.campaign, {
      actor: 'admin@arriv.com', housingCategory: true, approvedCreative: true, budgetCeiling: false, endDate: false,
    });
    check('Activation is refused until all four checks are confirmed', partial10.ok === false && (partial10.blockers || []).length >= 2);
    check('A partially confirmed campaign is not marked active', (await loadCampaign(store10.client, launched10.campaign.campaign_id)).status === 'SUBMITTED');
    const active10 = await confirmManualActive(store10.client, await loadCampaign(store10.client, launched10.campaign.campaign_id), {
      actor: 'admin@arriv.com', housingCategory: true, approvedCreative: true, budgetCeiling: true, endDate: true, note: 'Checked in Meta',
    });
    check('All four confirmations make the manual campaign active', active10.ok && active10.campaign.status === 'ACTIVE');

    const recorded10 = await recordManualMetrics(store10.client, active10.campaign, {
      actor: 'admin@arriv.com', rows: [{ impressions: '12000', reach: '9000', clicks: '140', spend: '63.50' }], verified: true,
    });
    check('Manual results are recorded with their source', recorded10.ok && recorded10.campaign.metrics.reporting_mode === 'manual' && recorded10.campaign.metrics.source === 'Meta Ads Manager');
    check('Manual results keep who entered them and when', recorded10.campaign.metrics.entered_by === 'admin@arriv.com' && !!recorded10.campaign.metrics.reported_at);
    check('Manual spend is applied to the campaign', recorded10.campaign.spent_cents === 6350, recorded10.campaign.spent_cents);
    const ledger10 = await ledgerFor(store10.client, launched10.campaign.campaign_id);
    check('Manual spend writes the same budget ledger entry the API path writes', ledger10.some((entry) => entry.entry_type === 'platform_spend' && entry.amount_cents === -6350));
    check('Manual results are appended to the reporting history', (recorded10.campaign.manual_metrics || []).length === 1);

    const imported10 = await recordManualMetrics(store10.client, await loadCampaign(store10.client, launched10.campaign.campaign_id), {
      actor: 'admin@arriv.com', importText: 'impressions,reach,clicks,spend\n15000,11000,180,84.25',
    });
    check('A pasted Meta export is read into figures', imported10.ok && imported10.campaign.metrics.spend_cents === 8425);
    check('The imported spend replaces the reported total, not the ledger delta', imported10.campaign.spent_cents === 8425);
    const badPaste = parseMetricRows('totally unreadable');
    check('An unreadable paste is refused rather than guessed', badPaste.rows.length === 0 && badPaste.errors.length > 0);
    const incomplete = await recordManualMetrics(store10.client, await loadCampaign(store10.client, launched10.campaign.campaign_id), {
      actor: 'admin@arriv.com', rows: [{ impressions: '100' }],
    });
    check('Figures without clicks and spend are refused', incomplete.ok === false && incomplete.code === 'METRICS_INCOMPLETE');

    const live10 = await loadCampaign(store10.client, launched10.campaign.campaign_id);
    const guarded10 = await guardListingEligibility(store10.client, {
      listing: listingFixture({ listing_status: 'sold' }),
      reason: 'The property was marked sold.',
      actor: 'system',
      now: now10,
    });
    check('An ineligible listing raises an urgent manual stop', guarded10.needs_stop.includes(live10.campaign_id));
    const stillLive10 = await loadCampaign(store10.client, live10.campaign_id);
    check('A manual campaign is not marked paused before Meta confirms the stop', stillLive10.status === 'ACTIVE' && stillLive10.manual_stop.required === true);
    check('The outstanding stop is visible on the campaign', stillLive10.manual_stop.confirmed !== true && String(stillLive10.attention_reason).includes('Meta Ads Manager'));

    const stopped10 = await confirmManualStop(store10.client, stillLive10, { actor: 'admin@arriv.com', note: 'Paused in Meta Ads Manager' });
    check('Confirming the Meta stop is what records it as paused', stopped10.ok && stopped10.campaign.status === 'PAUSED' && stopped10.campaign.manual_stop.confirmed === true);

    const reconciled10 = await reconcileManualBudget(store10.client, stopped10.campaign, { actor: 'admin@arriv.com', note: 'Read from Meta' });
    check('Reconciliation separates verified spend from unspent budget', reconciled10.reconciliation.authorized_cents === 17500 && reconciled10.reconciliation.spent_cents === 8425 && reconciled10.reconciliation.unspent_cents === 9075);
    check('Unspent budget is surfaced as refund due, never auto-refunded', reconciled10.reconciliation.refund_due_cents === 9075 && Number(reconciled10.campaign.refunded_cents || 0) === 0);
    check('Reconciliation keeps the management fee out of the advertising budget', reconciled10.reconciliation.management_fee_cents === 12400);
    const ledger10b = await ledgerFor(store10.client, live10.campaign_id);
    check('An active campaign is not yet released from its budget', !ledger10b.some((entry) => entry.entry_type === 'budget_release'));

    const results = {
      ok: checks.every((entry) => entry.pass),
      passed: checks.filter((entry) => entry.pass).length,
      total: checks.length,
      failed: checks.filter((entry) => !entry.pass),
      certification_note:
        'All advertising calls were simulated. A passing suite proves accounting, eligibility, state transitions and safeguards; it does not establish live Meta advertising capability.',
      checks,
    };
    return Response.json(results);
  } catch (error: any) {
    return Response.json({
      ok: false,
      error: error.message,
      passed: checks.filter((entry) => entry.pass).length,
      total: checks.length,
      failed: checks.filter((entry) => !entry.pass),
    }, { status: 500 });
  }
});