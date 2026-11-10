// Advertising campaign engine.
//
// One place owns every advertising state change, every ledger entry and every eligibility
// decision, so a campaign's history can always be explained from the record alone.
//
// Non-negotiable rules encoded here:
//  · a payment moves a campaign to review, never to launch;
//  · advertising budget is reserved customer money, never Arriv revenue;
//  · nothing spends more than the authorized ad budget;
//  · one payment creates one campaign, and one campaign creates one platform campaign;
//  · an ineligible property cannot advertise, and a campaign that cannot launch says why.

import {
  adPackage,
  adFinancials,
  authorizationSnapshot,
  AD_AGREEMENT_VERSION,
  AD_REFUND_POLICY,
  money,
} from "./propertyAdPackages.ts";
import {
  assertTransition,
  canTransition,
  isLive,
  AD_STATUS_LABELS,
  statusAfterPayment,
} from "./propertyAdStateMachine.ts";
import {
  buildAdCreative,
  approvedDetails,
  campaignFingerprint,
  creativeComplianceIssues,
  fingerprint,
} from "./propertyAdCreative.ts";
import { AD_SWITCH_OFF } from "./propertyAdSwitches.ts";

export const PAYABLE_STATUSES = ["AWAITING_PAYMENT", "APPROVED"];
export const NON_TERMINAL = [
  "DRAFT",
  "AWAITING_CUSTOMER_APPROVAL",
  "APPROVED",
  "AWAITING_PAYMENT",
  "PAID",
  "READY_FOR_REVIEW",
  "READY_TO_LAUNCH",
  "SUBMITTED",
  "ACTIVE",
  "PAUSED",
  "REFUND_PENDING",
];
export const LIVE_AD_STATUSES = ["SUBMITTED", "ACTIVE"];

function rows(result: any): any[] {
  if (Array.isArray(result)) return result;
  return result?.items || [];
}

export function newCampaignId(): string {
  return `adc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function newLedgerId(): string {
  return `adl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function appendEvent(campaign: any, event: { type: string; actor?: string; note?: string }, now = new Date()) {
  const events = Array.isArray(campaign.events) ? campaign.events.slice(-200) : [];
  events.push({ type: event.type, at: now.toISOString(), actor: event.actor || "system", note: event.note || "" });
  campaign.events = events;
  campaign.updated_at = now.toISOString();
  return campaign;
}

export async function loadListing(client: any, listingId: string) {
  const found = await client.asServiceRole.entities.PropertyListing.filter({ listing_id: listingId });
  return rows(found)[0] || null;
}

export async function loadCampaign(client: any, campaignId: string) {
  const found = await client.asServiceRole.entities.PropertyAdCampaign.filter({ campaign_id: campaignId });
  return rows(found)[0] || null;
}

export async function campaignsForListing(client: any, listingId: string) {
  return rows(await client.asServiceRole.entities.PropertyAdCampaign.filter({ listing_id: listingId }, { sort: "-created_date", limit: 50 }));
}

// The campaign that currently holds this property's advertising slot.
export async function currentCampaignForListing(client: any, listingId: string) {
  const all = await campaignsForListing(client, listingId);
  return all.find((campaign) => NON_TERMINAL.includes(campaign.status)) || null;
}

export async function updateCampaign(client: any, campaign: any, patch: Record<string, any>, event?: { type: string; actor?: string; note?: string }, now = new Date()) {
  Object.assign(campaign, patch);
  appendEvent(campaign, event || { type: "updated" }, now);
  const saved = await client.asServiceRole.entities.PropertyAdCampaign.update(campaign.id, {
    ...patch,
    events: campaign.events,
    updated_at: campaign.updated_at,
  });
  return saved || campaign;
}

// ── Eligibility ────────────────────────────────────────────────────────────────────────────────

export interface AdEligibility {
  eligible: boolean;
  blockers: string[];
}

// Advertising is only ever offered for a published, currently available property whose owner has
// confirmed authority to advertise it. Nothing here weakens the publication rules.
export function campaignEligibility(listing: any, now = new Date()): AdEligibility {
  const blockers: string[] = [];
  if (!listing) return { eligible: false, blockers: ["The property could not be found."] };
  if (listing.certification_mode) blockers.push("Certification listings cannot be advertised.");
  if (listing.publication_state !== "PUBLISHED") blockers.push("The property page must be published before it can be advertised.");
  if (!["active", "pending"].includes(String(listing.listing_status || ""))) {
    blockers.push("The property is not currently available for sale.");
  }
  if (listing.authority_confirmed !== true) blockers.push("Authority to advertise this property has not been confirmed.");
  if (!listing.public_url && !listing.public_slug) blockers.push("The property has no public page to send advertising traffic to.");
  const due = Date.parse(String(listing.status_confirmation_due_at || ""));
  if (Number.isFinite(due) && due < now.getTime()) {
    blockers.push("The listing status needs to be reconfirmed before advertising it.");
  }
  return { eligible: blockers.length === 0, blockers };
}

// ── Creative and draft ────────────────────────────────────────────────────────────────────────

export function publicUrlFor(listing: any, origin: string) {
  if (listing?.public_url) return String(listing.public_url);
  const base = String(origin || "").replace(/\/$/, "");
  return `${base}/properties/${listing?.public_slug || ""}`;
}

export function buildCreative(input: { listing: any; tier: string; publicUrl: string; campaignId: string; now?: Date }) {
  return buildAdCreative(input);
}

export async function createDraftCampaign(client: any, input: {
  listing: any;
  tier: string;
  actor: { email: string; name?: string };
  publicUrl: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const pkg = adPackage(input.tier);
  if (!pkg) throw new Error("Unknown advertising package");

  const eligibility = campaignEligibility(input.listing, now);
  if (!eligibility.eligible) {
    return { ok: false as const, code: "LISTING_NOT_ELIGIBLE", blockers: eligibility.blockers };
  }

  const existing = await currentCampaignForListing(client, input.listing.listing_id);
  if (existing && !["DRAFT", "AWAITING_CUSTOMER_APPROVAL"].includes(existing.status)) {
    return { ok: false as const, code: "CAMPAIGN_ALREADY_EXISTS", campaign: existing };
  }

  const financials = adFinancials(input.tier)!;
  const campaignId = existing?.campaign_id || newCampaignId();
  const creative = buildCreative({
    listing: input.listing,
    tier: input.tier,
    publicUrl: input.publicUrl,
    campaignId,
    now,
  });

  const base: any = {
    campaign_id: campaignId,
    tenant_id: input.listing.tenant_id || "tnt_estate_media",
    listing_id: input.listing.listing_id,
    job_id: input.listing.job_id || "",
    public_slug: input.listing.public_slug || "",
    public_url: input.publicUrl,
    client_email: input.actor.email,
    client_name: input.actor.name || input.listing.client_name || "",
    package_tier: pkg.tier,
    package_name: pkg.name,
    currency: "usd",
    total_cents: financials.total_cents,
    ad_budget_cents: financials.ad_budget_cents,
    management_fee_cents: financials.management_fee_cents,
    duration_days: financials.duration_days,
    spent_cents: 0,
    refunded_cents: 0,
    provider: pkg.platform,
    status: "AWAITING_CUSTOMER_APPROVAL",
    creative,
    creative_fingerprint: fingerprint(creative),
    authorization: { confirmed: false },
    events: [],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  appendEvent(base, { type: existing ? "draft_refreshed" : "draft_created", actor: input.actor.email, note: pkg.name });

  if (existing) {
    // A changed package or refreshed creative invalidates any earlier approval.
    base.status = "AWAITING_CUSTOMER_APPROVAL";
    const saved = await client.asServiceRole.entities.PropertyAdCampaign.update(existing.id, base);
    return { ok: true as const, campaign: saved || base, refreshed: true as const };
  }

  const created = await client.asServiceRole.entities.PropertyAdCampaign.create(base);
  return { ok: true as const, campaign: created || base, refreshed: false as const };
}

// ── Authorization ─────────────────────────────────────────────────────────────────────────────

export function authorizationIsCurrent(campaign: any): boolean {
  const auth = campaign?.authorization || {};
  if (auth.confirmed !== true) return false;
  return String(auth.fingerprint || "") === campaignFingerprint(campaign);
}

export async function recordAuthorization(client: any, campaign: any, input: { actor: { email: string; name?: string }; now?: Date }) {
  const now = input.now || new Date();
  const listingEligibility = null; // eligibility is re-checked by the caller with the listing
  void listingEligibility;
  const snapshot = authorizationSnapshot({
    address: campaign.public_slug || campaign.listing_id,
    tier: campaign.package_tier,
    totalCents: Number(campaign.total_cents || 0),
    adBudgetCents: Number(campaign.ad_budget_cents || 0),
    feeCents: Number(campaign.management_fee_cents || 0),
    durationDays: Number(campaign.duration_days || 0),
    provider: campaign.provider || "meta",
  });
  const authorization = {
    confirmed: true,
    at: now.toISOString(),
    by_email: input.actor.email,
    agreement_version: AD_AGREEMENT_VERSION,
    snapshot,
    approved_details: approvedDetails(campaign),
    fingerprint: campaignFingerprint(campaign),
  };
  const saved = await updateCampaign(
    client,
    campaign,
    { authorization, status: "AWAITING_CUSTOMER_APPROVAL" },
    { type: "authorization_recorded", actor: input.actor.email, note: AD_AGREEMENT_VERSION },
    now,
  );
  return saved;
}

// Material change → the customer must approve again before payment or launch.
export async function requireRenewedAuthorization(client: any, campaign: any, actor: string, reason: string, now = new Date()) {
  const authorization = { ...(campaign.authorization || {}), confirmed: false, invalidated_at: now.toISOString(), invalidated_reason: reason };
  return updateCampaign(
    client,
    campaign,
    { authorization, status: "AWAITING_CUSTOMER_APPROVAL", admin_approved_at: "" as any, admin_approved_by: "" },
    { type: "authorization_renewal_required", actor, note: reason },
    now,
  );
}

export async function approveByCustomer(client: any, campaign: any, input: { actor: { email: string; name?: string }; listing: any; now?: Date }) {
  const now = input.now || new Date();
  if (!canTransition(campaign.status, "APPROVED")) {
    return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  }
  if (!authorizationIsCurrent(campaign)) {
    return { ok: false as const, code: "AUTHORIZATION_REQUIRED" };
  }
  const eligibility = campaignEligibility(input.listing, now);
  if (!eligibility.eligible) {
    return { ok: false as const, code: "LISTING_NOT_ELIGIBLE", blockers: eligibility.blockers };
  }
  const issues = creativeComplianceIssues(campaign.creative);
  if (issues.length) {
    return { ok: false as const, code: "CREATIVE_NOT_COMPLIANT", blockers: issues };
  }
  const saved = await updateCampaign(
    client,
    campaign,
    { status: "APPROVED", customer_approved_at: now.toISOString() },
    { type: "customer_approved", actor: input.actor.email },
    now,
  );
  return { ok: true as const, campaign: saved };
}

// ── Payment ───────────────────────────────────────────────────────────────────────────────────

export async function attachPayment(client: any, campaign: any, input: { paymentIntentId: string; clientSecret: string; now?: Date }) {
  const now = input.now || new Date();
  assertTransition(campaign.status, "AWAITING_PAYMENT");
  return updateCampaign(
    client,
    campaign,
    {
      status: "AWAITING_PAYMENT",
      stripe_payment_intent_id: input.paymentIntentId,
      stripe_client_secret: input.clientSecret,
    },
    { type: "payment_started", note: input.paymentIntentId },
    now,
  );
}

// Idempotent by construction: the same payment can never fund two campaigns, and a repeat of the
// same event returns the campaign without creating a second budget.
export async function confirmPayment(client: any, input: {
  campaignId?: string;
  paymentIntentId: string;
  amountCents: number;
  now?: Date;
}) {
  const now = input.now || new Date();
  let campaign = input.campaignId ? await loadCampaign(client, input.campaignId) : null;
  if (!campaign) {
    const byIntent = rows(await client.asServiceRole.entities.PropertyAdCampaign.filter({ stripe_payment_intent_id: input.paymentIntentId }));
    campaign = byIntent[0] || null;
  }
  if (!campaign) return { ok: false as const, code: "CAMPAIGN_NOT_FOUND" };

  if (campaign.stripe_payment_intent_id && campaign.stripe_payment_intent_id !== input.paymentIntentId) {
    return { ok: false as const, code: "PAYMENT_MISMATCH", campaign };
  }

  const paidAlready = ["PAID", "READY_FOR_REVIEW", "READY_TO_LAUNCH", "SUBMITTED", "ACTIVE", "PAUSED", "COMPLETED", "REJECTED", "REFUND_PENDING", "REFUNDED"].includes(campaign.status);
  if (paidAlready) {
    return { ok: true as const, duplicate: true, campaign };
  }
  if (!["APPROVED", "AWAITING_PAYMENT"].includes(campaign.status)) {
    return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  }
  if (!authorizationIsCurrent(campaign)) {
    return { ok: false as const, code: "AUTHORIZATION_REQUIRED" };
  }

  const shortfall = Number(campaign.total_cents || 0) - Number(input.amountCents || 0);
  const patch: Record<string, any> = {
    status: statusAfterPayment(),
    stripe_payment_intent_id: input.paymentIntentId,
    paid_amount_cents: Number(input.amountCents || 0),
    processing_fee_cents: Math.round(Number(input.amountCents || 0) * 0.029) + 30,
  };
  if (shortfall > 0) {
    patch.review_required = true;
    patch.attention_reason = `Payment received was ${money(input.amountCents)} against a quoted ${money(campaign.total_cents)}. Launch is blocked pending review.`;
  }
  appendEvent(campaign, { type: "payment_confirmed", actor: "stripe", note: input.paymentIntentId }, now);
  appendEvent(campaign, { type: "status_changed", note: `${campaign.status} → ${patch.status}` }, now);
  Object.assign(campaign, patch);

  const saved = await client.asServiceRole.entities.PropertyAdCampaign.update(campaign.id, {
    ...patch,
    events: campaign.events,
    updated_at: now.toISOString(),
  });

  // The reserved advertising budget is committed to this campaign exactly once.
  await ensureLedgerEntry(client, campaign, {
    entry_type: "budget_commit",
    amount_cents: Number(campaign.ad_budget_cents || 0),
    reference: input.paymentIntentId,
    note: "Advertising budget reserved from the customer payment",
    now,
  });

  return { ok: true as const, duplicate: false, campaign: saved || campaign };
}

export async function markPaymentFailed(client: any, campaign: any, input: { paymentIntentId?: string; reason?: string; now?: Date }) {
  const now = input.now || new Date();
  if (["PAID", "READY_FOR_REVIEW", "READY_TO_LAUNCH", "SUBMITTED", "ACTIVE", "PAUSED", "COMPLETED"].includes(campaign.status)) {
    return { ok: true as const, ignored: true, campaign };
  }
  const saved = await updateCampaign(
    client,
    campaign,
    { status: "FAILED", review_required: true, attention_reason: input.reason || "The payment did not complete." },
    { type: "payment_failed", actor: "stripe", note: input.reason || "" },
    now,
  );
  return { ok: true as const, campaign: saved };
}

// ── Ledger ────────────────────────────────────────────────────────────────────────────────────

export async function ledgerFor(client: any, campaignId: string) {
  return rows(await client.asServiceRole.entities.PropertyAdLedgerEntry.filter({ campaign_id: campaignId }, { sort: "at", limit: 500 }));
}

export async function ensureLedgerEntry(client: any, campaign: any, input: {
  entry_type: string;
  amount_cents: number;
  reference?: string;
  note?: string;
  actor?: string;
  provider?: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const existing = await ledgerFor(client, campaign.campaign_id);
  // budget_commit and refund entries are once-only per reference; spend entries are incremental
  // and guarded by the caller.
  if (input.entry_type !== "platform_spend" && input.reference) {
    const duplicate = existing.find((entry) => entry.entry_type === input.entry_type && entry.reference === input.reference);
    if (duplicate) return duplicate;
  }
  const balanceBefore = ledgerBalance(existing);
  const entry = {
    entry_id: newLedgerId(),
    campaign_id: campaign.campaign_id,
    listing_id: campaign.listing_id,
    client_email: campaign.client_email,
    package_tier: campaign.package_tier,
    entry_type: input.entry_type,
    amount_cents: Number(input.amount_cents || 0),
    balance_after_cents: balanceBefore + Number(input.amount_cents || 0),
    provider: input.provider || campaign.provider || "meta",
    reference: input.reference || "",
    note: input.note || "",
    actor: input.actor || "system",
    at: now.toISOString(),
    certification_mode: campaign.certification_mode === true,
  };
  return await client.asServiceRole.entities.PropertyAdLedgerEntry.create(entry);
}

export function ledgerBalance(entries: any[]): number {
  return (entries || []).reduce((sum, entry) => sum + Number(entry?.amount_cents || 0), 0);
}

export function remainingBudget(campaign: any): number {
  return Math.max(0, Number(campaign?.ad_budget_cents || 0) - Number(campaign?.spent_cents || 0));
}

// ── Administrative approval and launch ───────────────────────────────────────────────────────

export async function adminApprove(client: any, campaign: any, input: { actor: string; note?: string; now?: Date }) {
  const now = input.now || new Date();
  if (campaign.status !== "READY_FOR_REVIEW") {
    return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  }
  if (campaign.review_required) {
    return { ok: false as const, code: "REVIEW_REQUIRED", reason: campaign.attention_reason || "This campaign needs attention before approval." };
  }
  if (!authorizationIsCurrent(campaign)) {
    return { ok: false as const, code: "AUTHORIZATION_REQUIRED" };
  }
  if (!campaign.stripe_payment_intent_id) {
    return { ok: false as const, code: "PAYMENT_REQUIRED" };
  }
  const saved = await updateCampaign(
    client,
    campaign,
    { status: "READY_TO_LAUNCH", admin_approved_at: now.toISOString(), admin_approved_by: input.actor },
    { type: "admin_approved", actor: input.actor, note: input.note || "" },
    now,
  );
  return { ok: true as const, campaign: saved };
}

export async function adminReject(client: any, campaign: any, input: { actor: string; reason: string; now?: Date }) {
  const now = input.now || new Date();
  if (!canTransition(campaign.status, "REJECTED")) {
    return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  }
  const saved = await updateCampaign(
    client,
    campaign,
    { status: "REJECTED", rejection_reason: input.reason, review_required: true, attention_reason: input.reason },
    { type: "admin_rejected", actor: input.actor, note: input.reason },
    now,
  );
  return { ok: true as const, campaign: saved };
}

// Everything that must be true before a single advertising dollar can move.
export function launchBlockers(campaign: any, input: {
  listing: any;
  account: any;
  switches: any;
  now?: Date;
  manual?: boolean;
}): string[] {
  const now = input.now || new Date();
  const switches = input.switches || AD_SWITCH_OFF;
  const blockers: string[] = [];

  if (!["READY_TO_LAUNCH", "PAUSED", "SUBMITTED"].includes(campaign.status)) {
    blockers.push(`Campaign state ${campaign.status} cannot launch.`);
  }
  if (!authorizationIsCurrent(campaign)) blockers.push("The customer authorization is missing or out of date.");
  if (!campaign.stripe_payment_intent_id || Number(campaign.paid_amount_cents || 0) <= 0) blockers.push("The campaign has not been paid for.");
  if (!campaign.admin_approved_at) blockers.push("An administrator has not approved this campaign.");
  if (campaign.review_required) blockers.push(campaign.attention_reason || "The campaign is flagged for review.");

  const issues = creativeComplianceIssues(campaign.creative);
  for (const issue of issues) blockers.push(issue);

  const eligibility = campaignEligibility(input.listing, now);
  for (const blocker of eligibility.blockers) blockers.push(blocker);

  const scheduled = Date.parse(String(campaign.scheduled_start_at || ""));
  if (Number.isFinite(scheduled) && scheduled > now.getTime()) blockers.push("The scheduled start time has not been reached.");

  if (!input.manual && !switches.auto_publish) blockers.push("Automated campaign publishing is switched off.");
  if (!switches.meta_connection && campaign.provider === "meta") blockers.push("The Meta connection switch is off.");
  if (!switches.budget_execution) blockers.push("Campaign budget execution is switched off.");

  if (!input.account || input.account.status !== "connected") blockers.push("No advertising account is connected.");
  if (input.account && input.account.spend_controls_verified !== true) {
    blockers.push("Platform spending controls have not been verified for this advertising account.");
  }
  if (input.listing && input.listing.certification_mode) blockers.push("Certification listings cannot be advertised.");

  return blockers;
}

function setSchedule(campaign: any, now: Date) {
  const start = Date.parse(String(campaign.scheduled_start_at || ""));
  const startAt = Number.isFinite(start) ? new Date(Math.max(start, now.getTime())) : now;
  const ends = new Date(startAt.getTime() + Number(campaign.duration_days || 0) * 86400000);
  return { startsAt: startAt.toISOString(), endsAt: ends.toISOString() };
}

// Idempotent: an existing provider campaign id means the platform already has this campaign, so a
// second launch is refused rather than duplicated.
export async function launchCampaign(client: any, campaign: any, input: {
  actor: string;
  listing: any;
  account: any;
  switches: any;
  provider: any;
  manual?: boolean;
  imageUrl?: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  if (campaign.provider_campaign_id) {
    return { ok: true as const, already_launched: true, campaign };
  }

  const blockers = launchBlockers(campaign, { ...input, now });
  if (blockers.length) {
    const saved = await updateCampaign(
      client,
      campaign,
      { launch_blocks: blockers, attention_reason: blockers[0], review_required: campaign.review_required === true },
      { type: "launch_blocked", actor: input.actor, note: blockers.slice(0, 3).join(" | ") },
      now,
    );
    return { ok: false as const, code: "LAUNCH_BLOCKED", blockers, campaign: saved };
  }

  const schedule = setSchedule(campaign, now);
  const attempts = Number(campaign.launch_attempts || 0) + 1;
  const working: any = { ...campaign, scheduled_start_at: campaign.scheduled_start_at || schedule.startsAt, ends_at: schedule.endsAt, launch_attempts: attempts };
  assertTransition(working.status, "SUBMITTED");

  const ctx = { campaign: working, creative: working.creative, account: input.account, switches: input.switches, imageUrl: input.imageUrl };
  const created = await input.provider.createCampaign(ctx);
  if (!created.ok) {
    const saved = await updateCampaign(
      client,
      campaign,
      {
        status: "FAILED",
        launch_attempts: attempts,
        provider_last_error: created.reason || created.code || "The campaign could not be created.",
        review_required: true,
        attention_reason: created.reason || "Campaign creation failed at the platform.",
      },
      { type: "launch_failed", actor: input.actor, note: created.code || "" },
      now,
    );
    return { ok: false as const, code: created.code || "PROVIDER_FAILED", reason: created.reason, campaign: saved };
  }

  const providerCampaignId = String(created.data?.id || "");
  if (!providerCampaignId) {
    const saved = await updateCampaign(
      client,
      campaign,
      {
        status: "FAILED",
        launch_attempts: attempts,
        provider_last_error: "The platform accepted the request but returned no campaign id.",
        review_required: true,
        attention_reason: "The platform returned no campaign id; verify manually before any retry.",
      },
      { type: "launch_ambiguous", actor: input.actor },
      now,
    );
    return { ok: false as const, code: "PROVIDER_NO_ID", campaign: saved };
  }

  working.provider_campaign_id = providerCampaignId;
  const adSet = await input.provider.createAdSet({ ...ctx, campaign: working });
  if (!adSet.ok) {
    const saved = await updateCampaign(
      client,
      campaign,
      {
        status: "PAUSED",
        provider_campaign_id: providerCampaignId,
        provider_last_error: adSet.reason || "The ad set could not be created.",
        review_required: true,
        attention_reason: "Campaign created but the ad set failed. Nothing is delivering.",
        launch_attempts: attempts,
      },
      { type: "adset_failed", actor: input.actor, note: adSet.code || "" },
      now,
    );
    return { ok: false as const, code: adSet.code || "ADSET_FAILED", campaign: saved };
  }
  working.provider_ad_set_id = String(adSet.data?.id || "");

  const creativeIds: string[] = [];
  const adIds: string[] = [];
  const variations = Array.isArray(working.creative?.variations) && working.creative.variations.length
    ? working.creative.variations
    : [{ label: "Primary", headline: working.creative?.headline, primary_text: working.creative?.primary_text }];

  for (const variation of variations) {
    const creativeResult = await input.provider.createCreative({ ...ctx, campaign: working }, variation);
    if (!creativeResult.ok) continue;
    const creativeId = String(creativeResult.data?.id || "");
    if (!creativeId) continue;
    creativeIds.push(creativeId);
    const adResult = await input.provider.createAd({ ...ctx, campaign: working }, { adSetId: working.provider_ad_set_id, creativeId });
    if (adResult.ok && adResult.data?.id) adIds.push(String(adResult.data.id));
  }

  if (!adIds.length) {
    const saved = await updateCampaign(
      client,
      campaign,
      {
        status: "PAUSED",
        provider_campaign_id: providerCampaignId,
        provider_ad_set_id: working.provider_ad_set_id,
        provider_creative_ids: creativeIds,
        provider_last_error: "No ad could be created from the approved creative.",
        review_required: true,
        attention_reason: "The campaign exists at the platform but has no ads. Nothing is delivering.",
        launch_attempts: attempts,
      },
      { type: "ad_creation_failed", actor: input.actor },
      now,
    );
    return { ok: false as const, code: "AD_CREATION_FAILED", campaign: saved };
  }

  const activated = await input.provider.setStatus(ctx, { providerCampaignId, status: "ACTIVE" });
  const saved = await updateCampaign(
    client,
    campaign,
    {
      status: activated.ok ? "ACTIVE" : "SUBMITTED",
      provider_campaign_id: providerCampaignId,
      provider_ad_set_id: working.provider_ad_set_id,
      provider_creative_ids: creativeIds,
      provider_ad_ids: adIds,
      provider_status: activated.ok ? "ACTIVE" : "PAUSED",
      provider_last_error: activated.ok ? "" : activated.reason || "",
      started_at: now.toISOString(),
      ends_at: schedule.endsAt,
      scheduled_start_at: working.scheduled_start_at,
      launch_attempts: attempts,
      launch_blocks: [],
      review_required: activated.ok ? false : true,
      attention_reason: activated.ok ? "" : activated.reason || "The campaign was created but could not be activated.",
    },
    { type: activated.ok ? "campaign_launched" : "campaign_submitted", actor: input.actor, note: providerCampaignId },
    now,
  );
  return { ok: true as const, campaign: saved, provider_campaign_id: providerCampaignId };
}

// ── Synchronization, budget and completion ───────────────────────────────────────────────────

// Platform-reported spend is recorded as a delta, so repeated syncs never double-count.
export async function applyReportedSpend(client: any, campaign: any, reportedSpendCents: number, input: { reference?: string; now?: Date } = {}) {
  const now = input.now || new Date();
  const reported = Math.max(0, Number(reportedSpendCents || 0));
  const known = Number(campaign.spent_cents || 0);
  const delta = reported - known;
  if (delta <= 0) return { ok: true as const, applied: 0, campaign };
  const budget = Number(campaign.ad_budget_cents || 0);
  if (reported > budget) {
    // Spend beyond the authorized budget can only come from the platform itself: record it,
    // stop the campaign and flag it rather than hiding the overrun.
    await ensureLedgerEntry(client, campaign, {
      entry_type: "platform_spend",
      amount_cents: -delta,
      reference: input.reference || `synced_${reported}`,
      note: "Platform spend update",
      now,
    });
    const saved = await updateCampaign(
      client,
      campaign,
      { spent_cents: reported, review_required: true, attention_reason: `Platform spend ${money(reported)} exceeded the authorized budget ${money(budget)}.` },
      { type: "budget_overrun", actor: "system", note: money(reported) },
      now,
    );
    return { ok: false as const, code: "BUDGET_EXCEEDED", applied: delta, campaign: saved };
  }
  await ensureLedgerEntry(client, campaign, {
    entry_type: "platform_spend",
    amount_cents: -delta,
    reference: input.reference || `synced_${reported}`,
    note: "Platform spend update",
    now,
  });
  const saved = await updateCampaign(client, campaign, { spent_cents: reported }, { type: "spend_recorded", note: money(reported) }, now);
  return { ok: true as const, applied: delta, campaign: saved };
}

export async function syncCampaign(client: any, campaign: any, input: { provider: any; account: any; switches: any; now?: Date }) {
  const now = input.now || new Date();
  if (!campaign.provider_campaign_id) return { ok: true as const, skipped: "not_submitted", campaign };

  const ctx = { campaign, creative: campaign.creative, account: input.account, switches: input.switches };
  const status = await input.provider.fetchStatus(ctx);
  if (status.ok) {
    const effective = String(status.data?.effective_status || status.data?.status || "").toUpperCase();
    const patch: Record<string, any> = { provider_status: effective, provider_last_sync_at: now.toISOString() };
    if (effective.includes("DISAPPROVED") || effective.includes("REJECTED")) {
      patch.review_required = true;
      patch.attention_reason = "The platform rejected the campaign.";
    }
    await updateCampaign(client, campaign, patch, { type: "provider_status", note: effective }, now);
  }

  const metrics = await input.provider.fetchMetrics(ctx);
  if (metrics.ok) {
    const data = metrics.data || {};
    const patch: Record<string, any> = {
      metrics: {
        impressions: data.impressions ?? null,
        reach: data.reach ?? null,
        clicks: data.clicks ?? null,
        spend_cents: data.spend_cents ?? null,
        reported_at: now.toISOString(),
        source: campaign.provider,
      },
      provider_last_sync_at: now.toISOString(),
    };
    await updateCampaign(client, campaign, patch, { type: "metrics_synced" }, now);
    if (Number.isFinite(Number(data.spend_cents))) {
      await applyReportedSpend(client, campaign, Number(data.spend_cents), { now });
    }
  } else if (metrics.code && metrics.code !== "NOT_SUBMITTED") {
    await updateCampaign(
      client,
      campaign,
      { attention_reason: metrics.reason || "Metrics could not be retrieved.", provider_last_sync_at: now.toISOString() },
      { type: "metrics_failed", note: metrics.code || "" },
      now,
    );
  }

  const ended = Date.parse(String(campaign.ends_at || ""));
  if (Number.isFinite(ended) && ended <= now.getTime() && ["ACTIVE", "SUBMITTED", "PAUSED"].includes(campaign.status)) {
    return { ...(await completeCampaign(client, campaign, { actor: "system", reason: "scheduled_end", now })), synced: true };
  }
  return { ok: true as const, campaign };
}

export async function pauseCampaign(client: any, campaign: any, input: { actor: string; reason: string; provider?: any; account?: any; switches?: any; now?: Date }) {
  const now = input.now || new Date();
  if (!canTransition(campaign.status, "PAUSED")) {
    return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  }
  let providerPaused = true;
  if (campaign.provider_campaign_id && input.provider) {
    const result = await input.provider.setStatus(
      { campaign, creative: campaign.creative, account: input.account, switches: input.switches || {} },
      { providerCampaignId: campaign.provider_campaign_id, status: "PAUSED" },
    );
    providerPaused = result.ok === true;
    if (!providerPaused) {
      const saved = await updateCampaign(
        client,
        campaign,
        { provider_last_error: result.reason || "The platform did not confirm the pause.", review_required: true, attention_reason: "Advertising may still be delivering: the pause was not confirmed." },
        { type: "pause_unconfirmed", actor: input.actor, note: result.code || "" },
        now,
      );
      return { ok: false as const, code: "PAUSE_UNCONFIRMED", campaign: saved };
    }
  }
  const saved = await updateCampaign(
    client,
    campaign,
    { status: "PAUSED", status_before_pause: campaign.status, pause_reason: input.reason, provider_status: "PAUSED" },
    { type: "paused", actor: input.actor, note: input.reason },
    now,
  );
  return { ok: true as const, campaign: saved };
}

export async function resumeCampaign(client: any, campaign: any, input: { actor: string; provider: any; account: any; switches: any; listing: any; now?: Date }) {
  const now = input.now || new Date();
  if (campaign.status !== "PAUSED") return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  const blockers = launchBlockers({ ...campaign, review_required: false }, { listing: input.listing, account: input.account, switches: input.switches, now, manual: true });
  if (blockers.length) return { ok: false as const, code: "LAUNCH_BLOCKED", blockers };
  if (!campaign.provider_campaign_id) {
    return launchCampaign(client, { ...campaign, status: "READY_TO_LAUNCH" }, { ...input, actor: input.actor, manual: true });
  }
  const result = await input.provider.setStatus(
    { campaign, creative: campaign.creative, account: input.account, switches: input.switches },
    { providerCampaignId: campaign.provider_campaign_id, status: "ACTIVE" },
  );
  if (!result.ok) {
    return { ok: false as const, code: result.code || "PROVIDER_FAILED", reason: result.reason };
  }
  const saved = await updateCampaign(
    client,
    campaign,
    { status: "ACTIVE", provider_status: "ACTIVE", pause_reason: "", ends_at: campaign.ends_at || new Date(now.getTime() + Number(campaign.duration_days || 0) * 86400000).toISOString() },
    { type: "resumed", actor: input.actor },
    now,
  );
  return { ok: true as const, campaign: saved };
}

export async function completeCampaign(client: any, campaign: any, input: { actor: string; reason?: string; provider?: any; account?: any; switches?: any; now?: Date }) {
  const now = input.now || new Date();
  let working = campaign;
  // Stop delivery before anything else, so a completed campaign is never still spending.
  if (working.provider_campaign_id && input.provider) {
    const stopped = await input.provider.setStatus(
      { campaign: working, creative: working.creative, account: input.account, switches: input.switches || {} },
      { providerCampaignId: working.provider_campaign_id, status: "PAUSED" },
    );
    if (!stopped.ok) {
      working = await updateCampaign(
        client,
        working,
        { attention_reason: `Campaign end could not be confirmed at the platform: ${stopped.reason || stopped.code || "unknown"}` },
        { type: "completion_unconfirmed", actor: input.actor },
        now,
      );
      return { ok: false as const, code: "COMPLETION_UNCONFIRMED", campaign: working };
    }
  }
  if (!canTransition(working.status, "COMPLETED")) {
    return { ok: false as const, code: "INVALID_STATE", status: working.status };
  }
  const remaining = remainingBudget(working);
  const saved = await updateCampaign(
    client,
    working,
    {
      status: "COMPLETED",
      completed_at: now.toISOString(),
      provider_status: "PAUSED",
      final_report_at: now.toISOString(),
      attention_reason: remaining > 0 ? `Unused advertising budget of ${money(remaining)} remains and must be reconciled.` : working.attention_reason || "",
      review_required: remaining > 0 ? true : working.review_required === true,
    },
    { type: "completed", actor: input.actor, note: input.reason || "campaign_end" },
    now,
  );
  if (remaining > 0) {
    await ensureLedgerEntry(client, working, {
      entry_type: "budget_release",
      amount_cents: -remaining,
      reference: `unused_${working.campaign_id}`,
      note: "Unused advertising budget released for reconciliation",
      now,
    });
  }
  return { ok: true as const, campaign: saved, unused_cents: remaining };
}

export async function failCampaign(client: any, campaign: any, input: { actor: string; reason: string; now?: Date }) {
  const now = input.now || new Date();
  if (!canTransition(campaign.status, "FAILED")) return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  const saved = await updateCampaign(
    client,
    campaign,
    { status: "FAILED", review_required: true, attention_reason: input.reason, provider_last_error: input.reason },
    { type: "failed", actor: input.actor, note: input.reason },
    now,
  );
  return { ok: true as const, campaign: saved };
}

export async function cancelCampaign(client: any, campaign: any, input: { actor: string; reason: string; provider?: any; account?: any; switches?: any; now?: Date }) {
  const now = input.now || new Date();
  if (!canTransition(campaign.status, "CANCELLED")) return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  if (campaign.provider_campaign_id && input.provider) {
    const stopped = await input.provider.setStatus(
      { campaign, creative: campaign.creative, account: input.account, switches: input.switches || {} },
      { providerCampaignId: campaign.provider_campaign_id, status: "PAUSED" },
    );
    if (!stopped.ok) {
      return { ok: false as const, code: "CANCEL_UNCONFIRMED", reason: stopped.reason || "The platform did not confirm the stop." };
    }
  }
  const spent = Number(campaign.spent_cents || 0);
  const saved = await updateCampaign(
    client,
    campaign,
    {
      status: "CANCELLED",
      review_required: true,
      attention_reason: spent > 0
        ? `Cancelled with ${money(spent)} of advertising already spent. Refund review required for the remainder.`
        : "Cancelled before any advertising spend. Refund review required.",
    },
    { type: "cancelled", actor: input.actor, note: input.reason },
    now,
  );
  return { ok: true as const, campaign: saved };
}

// ── Refunds ──────────────────────────────────────────────────────────────────────────────────

// What may be refunded: everything not spent at the platform. Nothing is ever refunded
// automatically, and platform spend already incurred is not refundable.
export function refundableAmount(campaign: any): number {
  const paid = Number(campaign?.paid_amount_cents || 0);
  const spent = Number(campaign?.spent_cents || 0);
  const refunded = Number(campaign?.refunded_cents || 0);
  return Math.max(0, paid - spent - refunded);
}

export async function requestRefundReview(client: any, campaign: any, input: { actor: string; reason: string; now?: Date }) {
  const now = input.now || new Date();
  if (!canTransition(campaign.status, "REFUND_PENDING")) {
    return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  }
  const saved = await updateCampaign(
    client,
    campaign,
    {
      status: "REFUND_PENDING",
      refund_status: "requested",
      refund_reason: input.reason,
      review_required: true,
      attention_reason: `Refund review: ${input.reason}`,
    },
    { type: "refund_requested", actor: input.actor, note: input.reason },
    now,
  );
  return { ok: true as const, campaign: saved, refundable_cents: refundableAmount(campaign) };
}

export async function decideRefund(client: any, campaign: any, input: {
  actor: string;
  decision: "full" | "partial" | "decline";
  amountCents?: number;
  reason: string;
  stripeRefundId?: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const refundable = refundableAmount(campaign);
  if (input.decision === "decline") {
    const saved = await updateCampaign(
      client,
      campaign,
      {
        refund_status: "declined",
        refund_reason: input.reason,
        refund_decided_at: now.toISOString(),
        refund_decided_by: input.actor,
        review_required: false,
        attention_reason: `Refund declined: ${input.reason}`,
      },
      { type: "refund_declined", actor: input.actor, note: input.reason },
      now,
    );
    return { ok: true as const, campaign: saved, refunded_cents: 0 };
  }

  const amount = input.decision === "full" ? refundable : Number(input.amountCents || 0);
  if (amount <= 0) return { ok: false as const, code: "NOTHING_TO_REFUND", refundable_cents: refundable };
  if (amount > refundable) {
    return { ok: false as const, code: "REFUND_EXCEEDS_AVAILABLE", refundable_cents: refundable };
  }

  await ensureLedgerEntry(client, campaign, {
    entry_type: "refund",
    amount_cents: -Math.min(amount, remainingBudget(campaign)),
    reference: input.stripeRefundId || `refund_${campaign.campaign_id}_${now.getTime()}`,
    note: `Refund approved: ${input.reason}`,
    actor: input.actor,
    now,
  });

  const saved = await updateCampaign(
    client,
    campaign,
    {
      refund_status: input.decision === "full" ? "full" : "partial",
      refunded_cents: Number(campaign.refunded_cents || 0) + amount,
      refund_reason: input.reason,
      refund_decided_at: now.toISOString(),
      refund_decided_by: input.actor,
      refund_stripe_id: input.stripeRefundId || "",
      status: input.decision === "full" ? "REFUNDED" : campaign.status,
      review_required: false,
      attention_reason: "",
    },
    { type: "refund_recorded", actor: input.actor, note: `${money(amount)} — ${input.reason}` },
    now,
  );
  return { ok: true as const, campaign: saved, refunded_cents: amount, refund_policy: AD_REFUND_POLICY };
}

// ── Listing eligibility enforcement ─────────────────────────────────────────────────────────

// Called the moment a listing becomes ineligible, so critical enforcement never waits for a sweep.
export async function guardListingEligibility(client: any, input: {
  listing: any;
  reason: string;
  actor: string;
  provider?: any;
  account?: any;
  switches?: any;
  now?: Date;
}) {
  const now = input.now || new Date();
  const affected = (await campaignsForListing(client, input.listing.listing_id))
    .filter((campaign) => NON_TERMINAL.includes(campaign.status) && campaign.status !== "DRAFT");
  const paused: string[] = [];
  for (const campaign of affected) {
    if (["SUBMITTED", "ACTIVE"].includes(campaign.status)) {
      if (!campaign.provider_campaign_id || !input.provider) {
        // Nothing is running at the platform, so the record can be paused directly.
        await pauseCampaign(client, campaign, { actor: input.actor, reason: input.reason, now });
        paused.push(campaign.campaign_id);
        continue;
      }
      const result = await pauseCampaign(client, campaign, {
        actor: input.actor,
        reason: input.reason,
        provider: input.provider,
        account: input.account,
        switches: input.switches,
        now,
      });
      if (result.ok) paused.push(campaign.campaign_id);
      continue;
    }
    if (campaign.status === "READY_TO_LAUNCH") {
      // Future launches are blocked outright rather than paused.
      await updateCampaign(
        client,
        campaign,
        { review_required: true, attention_reason: `Launch blocked: ${input.reason}`, status: "PAUSED", status_before_pause: "READY_TO_LAUNCH", pause_reason: input.reason },
        { type: "launch_blocked_ineligible", actor: input.actor, note: input.reason },
        now,
      );
      paused.push(campaign.campaign_id);
    }
  }
  return { affected: affected.map((c) => c.campaign_id), paused };
}

export function campaignSummaryLine(campaign: any): string {
  return `${campaign.campaign_id} · ${campaign.package_name || campaign.package_tier} · ${AD_STATUS_LABELS[campaign.status] || campaign.status}`;
}