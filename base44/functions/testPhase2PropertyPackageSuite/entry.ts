import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  PACKAGE_PRICE_CENTS,
  UPGRADE_PRICE_CENTS,
  isPaidTier,
  rankFor,
  refundAdvice,
} from '../../shared/propertyPackages.ts';
import {
  activatePromotion,
  createPendingPurchase,
  listingEligibility,
  markPaymentFailed,
  promotionEntitlement,
  promotionPerformance,
  purchasable,
  quotePurchase,
  reconcilePromotion,
  recordRefund,
} from '../../shared/propertyPromotionEngine.ts';
import { orderDirectoryResults, loadRankedDirectory } from '../../shared/propertyDirectoryRanking.ts';
import { buildMarketingPackage, buildCampaignPlan } from '../../shared/propertyMarketing.ts';

// Phase 2 automated suite.
//
// Touches NOTHING real: no Stripe charge, no refund, no email, and not one production record. The
// promotion lifecycle runs against an in-memory entity store and outbound HTTP (edge purge, Brevo)
// is stubbed, so the engine's real code paths are exercised without side effects.

function makeStore() {
  const tables: Record<string, any[]> = {
    PropertyPromotion: [],
    PropertyListing: [],
    PropertyTrafficDaily: [],
    PropertyInquiry: [],
    AppSetting: [],
  };
  let seq = 0;

  const matches = (record: any, query: Record<string, any>): boolean =>
    Object.entries(query || {}).every(([key, value]: [string, any]) => {
      const actual = record[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if ("$in" in value) return value.$in.includes(actual);
        if ("$gte" in value && "$lte" in value) return String(actual || "") >= String(value.$gte) && String(actual || "") <= String(value.$lte);
        if ("$gte" in value) return String(actual || "") >= String(value.$gte);
        if ("$lte" in value) return String(actual || "") <= String(value.$lte);
        if ("$ne" in value) return actual !== value.$ne;
        return false;
      }
      return actual === value;
    });

  const api = (name: string) => ({
    create: async (data: any) => {
      const record = { id: `${name}_${++seq}`, created_date: new Date().toISOString(), ...data };
      tables[name].push(record);
      return { ...record };
    },
    update: async (id: string, patch: any) => {
      const record = tables[name].find((r) => r.id === id || r.promotion_id === id);
      if (!record) throw new Error(`${name} ${id} not found`);
      Object.assign(record, patch);
      return { ...record };
    },
    get: async (id: string) => {
      const record = tables[name].find((r) => r.id === id);
      if (!record) throw new Error(`${name} ${id} not found`);
      return { ...record };
    },
    filter: async (query: Record<string, any>, _opts?: any) => ({
      items: tables[name].filter((r) => matches(r, query)).map((r) => ({ ...r })),
      has_more: false,
      next_cursor: null,
    }),
    count: async (query: Record<string, any>) => tables[name].filter((r) => matches(r, query)).length,
  });

  const client: any = {
    asServiceRole: { entities: new Proxy({}, { get: (_t, key: string) => api(key) }) },
  };
  return { client, tables };
}

function fakeListing(overrides: Record<string, any> = {}) {
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  return {
    listing_id: "prop_t1",
    public_slug: "123-test-lane-atlanta-ga-30327-t1",
    property_address: "123 Test Lane",
    city: "Atlanta",
    state: "GA",
    zip: "30327",
    client_email: "owner@example.com",
    client_name: "Owner Person",
    publication_state: "PUBLISHED",
    listing_status: "active",
    published_at: threeDaysAgo,
    last_status_confirmed_at: threeDaysAgo,
    authority_confirmed: true,
    listing_price: 525000,
    bedrooms: 4,
    bathrooms: 3,
    square_footage: 2800,
    property_type: "house",
    brokerage_name: "Arriv Realty",
    agent_name: "Dana Agent",
    cover_file_id: "file_cover",
    selected_media: [{ drive_file_id: "file_cover", kind: "photo", position: 0 }],
    certification_mode: false,
    ...overrides,
  };
}

Deno.serve(async (req) => {
  const results: { name: string; pass: boolean; detail: string }[] = [];
  const check = (name: string, pass: boolean, detail: any = "") => {
    results.push({ name, pass: !!pass, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
  };

  const purgeCalls: any[] = [];
  const originalFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (input: any, init: any) => {
    try {
      purgeCalls.push({ url: String(input), body: JSON.parse(String(init?.body || "{}")) });
    } catch {
      purgeCalls.push({ url: String(input), body: {} });
    }
    return new Response(JSON.stringify({ messageId: "test_receipt" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const base44 = createClientFromRequest(req);
    const { client, tables } = makeStore();
    const listing = fakeListing();
    tables.PropertyListing.push({ ...listing, id: "listing_row_1" });
    const days = (n: number) => n * 86400000;

    // ── Pricing and quotes ────────────────────────────────────────────────
    check("Plus is a $79 one-time purchase", PACKAGE_PRICE_CENTS.plus === 7900, PACKAGE_PRICE_CENTS.plus);
    check("Pro is a $149 one-time purchase", PACKAGE_PRICE_CENTS.pro === 14900, PACKAGE_PRICE_CENTS.pro);
    check("Pro placement outranks Plus placement", rankFor("pro") > rankFor("plus"), `${rankFor("pro")} > ${rankFor("plus")}`);
    const freshQuote = quotePurchase(null, "plus");
    check("A new Plus purchase quotes the full price", freshQuote.amount_cents === 7900 && freshQuote.purchase_type === "new", freshQuote);

    // ── A package can be reserved before approval, never charged before it ─
    const draftCheck = purchasable(fakeListing({ publication_state: "DRAFT" }));
    check("A package can be reserved on a draft page", draftCheck.ok === true && draftCheck.live_now === false, draftCheck);
    const approvedCheck = purchasable(fakeListing({ publication_state: "APPROVED" }));
    check("An approved-but-unpublished page can reserve a package", approvedCheck.ok === true && approvedCheck.live_now === false, approvedCheck);
    check("A package cannot be bought for a sold listing", purchasable(fakeListing({ listing_status: "sold" })).ok === false);
    check("A package cannot be bought for an archived page", purchasable(fakeListing({ publication_state: "ARCHIVED" })).ok === false);
    const liveCheck = purchasable(fakeListing());
    check("A published, available, reconfirmed page can carry a package", liveCheck.ok === true && liveCheck.live_now === true);

    // ── Purchase → verified payment → activation ──────────────────────────
    const plusPending = await createPendingPurchase(client, { listing, tier: "plus", clientEmail: "owner@example.com", certificationMode: true });
    // A second pending purchase, created before anything is active, is used further down to prove
    // that one payment can never fund two promotions.
    const reusePending = await createPendingPurchase(client, { listing, tier: "plus", clientEmail: "owner@example.com", certificationMode: true });
    check("A purchase starts pending and grants nothing", plusPending.status === "pending_payment", plusPending.status);
    check("A pending purchase carries no placement", promotionEntitlement(plusPending).active === false);

    const activated = await activatePromotion(client, plusPending.id, { paymentIntentId: "pi_test_plus_1", amountCents: 7900 });
    check("A verified payment activates the package", activated.promotion.status === "active", activated.promotion.status);
    const plusEntitlement = promotionEntitlement(activated.promotion);
    check("Activation grants a 30-day term", plusEntitlement.days_remaining >= 29 && plusEntitlement.days_remaining <= 30, plusEntitlement.days_remaining);
    check("A Plus promotion grants Featured placement", plusEntitlement.placement_label === "Featured", plusEntitlement.placement_label);

    // ── Duplicate webhook delivery ────────────────────────────────────────
    const endsBefore = tables.PropertyPromotion.find((p: any) => p.promotion_id === plusPending.promotion_id).ends_at;
    const duplicate = await activatePromotion(client, plusPending.id, { paymentIntentId: "pi_test_plus_1", amountCents: 7900 });
    const afterDuplicate = tables.PropertyPromotion.find((p: any) => p.promotion_id === plusPending.promotion_id);
    check("A duplicate payment event is reported as duplicate", duplicate.duplicate === true);
    check("A duplicate payment event does not extend the term", afterDuplicate.ends_at === endsBefore);
    check("A duplicate payment event creates no second entitlement", tables.PropertyPromotion.filter((p: any) => p.listing_id === "prop_t1" && ["active", "paused"].includes(p.status)).length === 1);

    // ── One payment may only fund one promotion ───────────────────────────
    let paymentReuseBlocked = false;
    try {
      await activatePromotion(client, reusePending.id, { paymentIntentId: "pi_test_plus_1", amountCents: 7900 });
    } catch (error: any) {
      paymentReuseBlocked = String(error?.message || "").includes("PAYMENT_ALREADY_USED");
    }
    check("A payment already used cannot fund a second promotion", paymentReuseBlocked);
    await markPaymentFailed(client, reusePending.id, { reason: "test cleanup" });

    // ── Failed payment never activates ────────────────────────────────────
    const failedPending = await createPendingPurchase(client, { listing, tier: "pro", clientEmail: "owner@example.com", current: activated.promotion, certificationMode: true });
    const failedPayment = await markPaymentFailed(client, failedPending.id, { paymentIntentId: "pi_failed", reason: "card declined" });
    check("A failed payment never activates benefits", failedPayment.promotion.status === "payment_failed" && promotionEntitlement(failedPayment.promotion).active === false, failedPayment.promotion.status);

    // ── Amount mismatch is flagged, never granted ─────────────────────────
    const mismatchPending = await createPendingPurchase(client, { listing, tier: "pro", clientEmail: "owner@example.com", current: activated.promotion, certificationMode: true });
    const mismatch = await activatePromotion(client, mismatchPending.id, { paymentIntentId: "pi_short", amountCents: 100 });
    check("A short payment grants nothing and is flagged", mismatch.review === true && mismatch.promotion.status === "pending_payment" && mismatch.promotion.review_required === true, mismatch.promotion.status);
    await markPaymentFailed(client, mismatchPending.id, { reason: "test cleanup" });

    // ── Plus → Pro upgrade ────────────────────────────────────────────────
    const currentPlus = tables.PropertyPromotion.find((p: any) => p.promotion_id === plusPending.promotion_id);
    const upgradeQuote = quotePurchase(currentPlus, "pro");
    check("Upgrading Plus to Pro costs the $70 difference", upgradeQuote.amount_cents === UPGRADE_PRICE_CENTS && upgradeQuote.purchase_type === "upgrade", upgradeQuote);

    const upgradePending = await createPendingPurchase(client, { listing, tier: "pro", clientEmail: "owner@example.com", current: currentPlus, certificationMode: true });
    check("The upgrade purchase is recorded at the difference", upgradePending.amount_cents === 7000, upgradePending.amount_cents);
    const upgraded = await activatePromotion(client, upgradePending.id, { paymentIntentId: "pi_test_upgrade", amountCents: 7000 });
    const supersededPlus = tables.PropertyPromotion.find((p: any) => p.promotion_id === plusPending.promotion_id);
    check("Upgrading activates Pro", upgraded.promotion.status === "active" && upgraded.promotion.package_tier === "pro");
    check("Upgrading ends the Plus promotion instead of overlapping it", supersededPlus.status === "ended" && supersededPlus.ended_reason === "replaced_by_upgrade", supersededPlus.ended_reason);
    check("Only one placement is ever live per property", tables.PropertyPromotion.filter((p: any) => p.listing_id === "prop_t1" && ["active", "paused"].includes(p.status)).length === 1);
    check("Upgrading starts a fresh 30-day term", promotionEntitlement(upgraded.promotion).days_remaining >= 29);
    check("A Pro promotion grants Priority placement", promotionEntitlement(upgraded.promotion).placement_label === "Priority");

    // ── Renewal ───────────────────────────────────────────────────────────
    const renewalQuote = quotePurchase(null, "pro");
    check("A renewal quotes the full package price", renewalQuote.amount_cents === 14900, renewalQuote.amount_cents);

    // ── Expiration ────────────────────────────────────────────────────────
    const expiredPro = { ...upgraded.promotion, status: "active", ends_at: new Date(Date.now() - days(1)).toISOString() };
    check("A promotion past its end date grants no placement", promotionEntitlement(expiredPro).active === false);

    // ── Eligibility changes: pause, resume, terminate ─────────────────────
    const livePro = tables.PropertyPromotion.find((p: any) => p.promotion_id === upgradePending.promotion_id);
    const pausedAction = await reconcilePromotion(client, livePro, fakeListing({ publication_state: "UNPUBLISHED" }));
    check("An unpublished page pauses the promotion", pausedAction.action === "paused");
    const pausedRecord = tables.PropertyPromotion.find((p: any) => p.promotion_id === upgradePending.promotion_id);
    check("A paused promotion carries no placement", promotionEntitlement(pausedRecord).rank === 0);
    check("A paused promotion keeps its remaining days", Number(pausedRecord.remaining_ms_at_pause || 0) > days(28), pausedRecord.remaining_ms_at_pause);

    const resumedAction = await reconcilePromotion(client, pausedRecord, fakeListing());
    check("Eligibility again resumes the promotion", resumedAction.action === "resumed");
    const resumedRecord = tables.PropertyPromotion.find((p: any) => p.promotion_id === upgradePending.promotion_id);
    check("Resuming restores the paid-for days", promotionEntitlement(resumedRecord).days_remaining >= 28, promotionEntitlement(resumedRecord).days_remaining);

    const deadlinePassed = { ...resumedRecord, status: "paused", paused_at: new Date(Date.now() - days(31)).toISOString(), pause_deadline_at: new Date(Date.now() - days(1)).toISOString() };
    const endedAction = await reconcilePromotion(client, deadlinePassed, fakeListing({ publication_state: "UNPUBLISHED" }));
    check("A pause longer than 30 days ends the promotion and flags it", endedAction.action === "ended_for_ineligibility");
    const flagged = tables.PropertyPromotion.find((p: any) => p.promotion_id === upgradePending.promotion_id);
    check("Ending for prolonged ineligibility raises a review", flagged.review_required === true, flagged.review_reason);

    check("A sold listing terminates the placement immediately", listingEligibility(fakeListing({ listing_status: "sold" })).terminal === true);
    check("A withdrawn listing terminates the placement immediately", listingEligibility(fakeListing({ listing_status: "withdrawn" })).terminal === true);
    check("A revoked authorization terminates the placement", listingEligibility(fakeListing({ authority_confirmed: false })).terminal === true);
    check("An overdue status confirmation is pausable, not fatal", listingEligibility(fakeListing({ last_status_confirmed_at: new Date(Date.now() - days(31)).toISOString() })).terminal === false);
    check("A promotion cannot make an unpublished page public", listingEligibility(fakeListing({ publication_state: "DRAFT" })).ok === false);

    // ── Refunds ───────────────────────────────────────────────────────────
    const refundTarget = await createPendingPurchase(client, { listing, tier: "plus", clientEmail: "owner@example.com", certificationMode: true });
    await activatePromotion(client, refundTarget.id, { paymentIntentId: "pi_refund_case", amountCents: 7900 });
    const liveForRefund = tables.PropertyPromotion.find((p: any) => p.promotion_id === refundTarget.promotion_id);
    check("A refund is advised as available inside 48 hours", refundAdvice({ ...liveForRefund, activated_at: new Date(Date.now() - 3600000).toISOString() }).eligible === true);

    const partialRefund = await recordRefund(client, liveForRefund, { refundType: "partial", amountCents: 2000, reason: "partially undelivered", approvedBy: "admin@example.com" });
    check("A partial refund is recorded without ending the placement", partialRefund.status === "active" && partialRefund.refund_status === "partial" && partialRefund.refund_amount_cents === 2000, partialRefund.refund_status);

    const fullRefund = await recordRefund(client, partialRefund, { refundType: "full", reason: "service not delivered", approvedBy: "admin@example.com" });
    check("A full refund removes the paid benefit immediately", fullRefund.status === "refunded" && promotionEntitlement(fullRefund).active === false, fullRefund.status);
    check("A full refund records the amount refunded", fullRefund.refund_amount_cents === 7900, fullRefund.refund_amount_cents);
    check("Refund handling never touches media-order commissions", !Object.keys(fullRefund).some((k) => /commission/i.test(k)));

    // ── Cache invalidation ────────────────────────────────────────────────
    const purgeBodies = purgeCalls.map((c) => c.body);
    check("Activation purges the shared directory cache", purgeBodies.some((b: any) => (b.slugs || []).includes("properties")));
    check("Every placement change requests a purge", purgeCalls.length >= 4, purgeCalls.length);
    check("A purge names the property's own page", purgeBodies.some((b: any) => String(b.slug || "").includes("123-test-lane")));

    // ── Directory ranking consistency ─────────────────────────────────────
    const ranked = orderDirectoryResults(
      [
        { listing_id: "free_old", published_at: new Date(Date.now() - days(10)).toISOString() },
        { listing_id: "free_new", published_at: new Date(Date.now() - days(1)).toISOString() },
        { listing_id: "plus_one", published_at: new Date(Date.now() - days(20)).toISOString() },
        { listing_id: "pro_one", published_at: new Date(Date.now() - days(40)).toISOString() },
      ],
      new Map([["plus_one", { rank: 1, tier: "plus" }], ["pro_one", { rank: 2, tier: "pro" }]]),
    );
    const rankedIds = ranked.map((r: any) => r.listing_id).join(",");
    check("Ranking order is Priority, then Featured, then standard", rankedIds === "pro_one,plus_one,free_new,free_old", rankedIds);
    const rankedAgain = orderDirectoryResults(
      [
        { listing_id: "free_new", published_at: new Date(Date.now() - days(1)).toISOString() },
        { listing_id: "pro_one", published_at: new Date(Date.now() - days(40)).toISOString() },
      ],
      new Map([["pro_one", { rank: 2, tier: "pro" }]]),
    );
    check("Ranking is deterministic for the same input", rankedAgain[0].listing_id === "pro_one");

    tables.PropertyListing.push({ ...fakeListing({ listing_id: "prop_sold", listing_status: "sold", public_slug: "sold-prop" }), id: "listing_row_2" });
    tables.PropertyPromotion.push({ id: "promo_row_sold", promotion_id: "promo_sold", listing_id: "prop_sold", package_tier: "pro", status: "active", ends_at: new Date(Date.now() + days(20)).toISOString(), activated_at: new Date().toISOString(), certification_mode: true });
    tables.PropertyListing.push({ ...fakeListing({ listing_id: "prop_live", public_slug: "live-prop" }), id: "listing_row_3" });
    tables.PropertyPromotion.push({ id: "promo_row_live", promotion_id: "promo_live", listing_id: "prop_live", package_tier: "plus", status: "active", ends_at: new Date(Date.now() + days(20)).toISOString(), activated_at: new Date().toISOString(), certification_mode: true });

    const directoryQuery = { publication_state: "PUBLISHED", listing_status: { $in: ["active", "pending"] }, certification_mode: { $ne: true } };
    const rankedDirectory = await loadRankedDirectory(client, { query: directoryQuery, limit: 10 });
    const directoryIds = rankedDirectory.items.map((l: any) => l.listing_id);
    check("A paid placement cannot surface an ineligible listing", !directoryIds.includes("prop_sold"), directoryIds.join(","));
    check("An eligible paid placement is shown first", rankedDirectory.items[0]?.listing_id === "prop_live", directoryIds[0]);
    check("The promoted listing carries its placement label", rankedDirectory.items[0]?.placement_label === "Featured", rankedDirectory.items[0]?.placement_label);
    check("Ranking reports how many placements it placed", rankedDirectory.promoted_count === 1, rankedDirectory.promoted_count);

    // ── Reporting accuracy ────────────────────────────────────────────────
    tables.PropertyTrafficDaily.push(
      { id: "t1", listing_id: "prop_live", day: "2026-03-02", channel: "social", source_label: "facebook", views: 5 },
      { id: "t2", listing_id: "prop_live", day: "2026-03-03", channel: "direct", source_label: "direct", views: 3 },
    );
    tables.PropertyInquiry.push(
      { id: "i1", listing_id: "prop_live", channel: "social", created_at: "2026-03-02T10:00:00.000Z", created_date: "2026-03-02T10:00:00.000Z" },
      { id: "i2", listing_id: "prop_live", channel: "paid", created_at: "2026-03-03T10:00:00.000Z", created_date: "2026-03-03T10:00:00.000Z" },
    );
    const performance = await promotionPerformance(client, { listing_id: "prop_live" }, { startIso: "2026-03-01T00:00:00.000Z", endIso: "2026-03-07T00:00:00.000Z" });
    check("Views count only what was recorded", performance.views === 8, performance.views);
    check("Inquiries count only what was recorded", performance.inquiries === 2, performance.inquiries);
    check("Conversion rate is derived from real figures", performance.conversion_rate === 25, performance.conversion_rate);
    check("Traffic is split by channel", performance.views_by_channel.social === 5 && performance.views_by_channel.direct === 3, performance.views_by_channel);
    check("Weekly buckets are produced", performance.weekly.length >= 1, performance.weekly.length);
    check("No advertising metrics are invented", performance.advertising_metrics.available === false);

    // ── Marketing assets ──────────────────────────────────────────────────
    const plusMarketing = buildMarketingPackage(listing, "plus");
    const proMarketing = buildMarketingPackage(listing, "pro");
    const freeMarketing = buildMarketingPackage(listing, "free");
    check("Free marketing gives shareable links only", freeMarketing.graphics.length === 0 && freeMarketing.captions.length === 0 && freeMarketing.links.links.length >= 1);
    check("Plus marketing includes graphics and captions", plusMarketing.graphics.length >= 2 && plusMarketing.captions.length >= 2, `${plusMarketing.graphics.length}/${plusMarketing.captions.length}`);
    check("Pro marketing adds more variations than Plus", proMarketing.captions.length > plusMarketing.captions.length, `${proMarketing.captions.length} > ${plusMarketing.captions.length}`);
    check("Marketing carries UTM-tracked links", plusMarketing.links.links.some((l: any) => l.url.includes("utm_source=")));
    check("Marketing captions use the approved address", plusMarketing.captions.every((c: any) => c.text.includes("123 Test Lane")));
    const captionText = proMarketing.captions.map((c: any) => c.text.toLowerCase()).join(" ");
    check("Marketing copy never promises results", !/(guarantee|guaranteed|ensure|stunning|dream home|won't last)/.test(captionText), captionText.slice(0, 60));
    check("Marketing graphics use the approved cover photograph", plusMarketing.graphics.every((g: any) => g.cover_url.includes("file_cover")));
    check("Marketing graphics carry a no-guarantee disclosure", plusMarketing.graphics.every((g: any) => /no guarantee/i.test(g.disclosure)));

    const campaign = buildCampaignPlan(listing, "pro");
    check("Pro campaign preparation exists", campaign.available === true);
    check("Advertising integrations stay disabled", campaign.integrations.every((i: any) => i.status === "disabled"));
    check("Campaign preparation states ad spend is not included", /does not fund/i.test(campaign.budget.note));
    check("Campaign guidance carries Fair Housing compliance", campaign.compliance.some((c: string) => /Fair Housing/i.test(c)));
    check("Only Pro gets a campaign preparation area", buildCampaignPlan(listing, "plus").available === false);

    // ── The free page is never touched by a paid change ────────────────────
    const storedListing = tables.PropertyListing.find((l: any) => l.listing_id === "prop_t1");
    check("No promotion change writes to the property page", storedListing.publication_state === "PUBLISHED" && storedListing.listing_status === "active");
    check("No placement field is denormalised onto the page", !("placement_rank" in storedListing) && !("placement_tier" in storedListing));
    check("Paid tiers are correctly identified", isPaidTier("plus") && isPaidTier("pro") && !isPaidTier("free"));

    const failedChecks = results.filter((r) => !r.pass);
    return Response.json({
      ok: failedChecks.length === 0,
      passed: results.length - failedChecks.length,
      total: results.length,
      failed: failedChecks.map((r) => ({ name: r.name, detail: r.detail })),
      checks: results,
    });
  } catch (error: any) {
    return Response.json({
      ok: false,
      error: String(error?.message || error),
      stack: String(error?.stack || "").split("\n").slice(0, 6),
      passed: results.filter((r) => r.pass).length,
      total: results.length,
      failed: results.filter((r) => !r.pass).map((r) => ({ name: r.name, detail: r.detail })),
    }, { status: 500 });
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
});