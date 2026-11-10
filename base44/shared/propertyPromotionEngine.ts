// Property promotion engine — the one place a paid placement is created, activated, paused,
// expired, refunded or ended.
//
// Rules this file enforces, in one place, so no caller can grant itself a benefit:
//   * a promotion exists only as a record; benefits are granted when a VERIFIED payment flips it
//     to active, and never otherwise;
//   * activation is idempotent — a duplicate webhook changes nothing, and one payment can never
//     fund two promotions;
//   * at most one live promotion per listing, so placements can never overlap;
//   * a listing that becomes ineligible pauses (never silently keeps) its placement, and loses it
//     outright when the listing is sold, withdrawn, archived or its authorization is revoked;
//   * nothing here publishes, approves or unpublishes a property page. The free page keeps its own
//     publication and eligibility rules; this module only decides whether a paid PLACEMENT shows.
//   * refunds are recorded here and nowhere near the media-order commission reversal workflow.

import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from "./brevoClient.ts";
import { purgeListingFromEdge } from "./edgeCache.ts";
import {
  AVAILABLE_LISTING_STATUSES,
  DIRECTORY_SLUG,
  STATUS_AUTO_DEACTIVATE_AFTER_DAYS,
  STATUS_CONFIRMATION_WINDOW_DAYS,
  isPubliclyActive,
  propertyPageUrl,
  sanitizeText,
} from "./propertyVisibility.ts";
import {
  DAY_MS,
  MAX_PAUSE_DAYS,
  PROMOTION_TERM_DAYS,
  UPGRADE_PRICE_CENTS,
  packageFor,
  placementLabelFor,
  priceLabelFromCents,
  rankFor,
} from "./propertyPackages.ts";

export const LIVE_STATUSES = ["active", "paused"];

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

export function newPromotionId(): string {
  return `promo_${crypto.randomUUID()}`;
}

export function appendEvent(promotion: any, event: { type: string; actor?: string; note?: string }, now = new Date()) {
  const events = Array.isArray(promotion?.events) ? promotion.events : [];
  return [...events, { type: event.type, at: now.toISOString(), actor: event.actor || "system", note: sanitizeText(event.note, 400) }].slice(-100);
}

// ---------------------------------------------------------------------------
// Eligibility — may this listing carry (or keep) a paid placement right now?
// ---------------------------------------------------------------------------
export interface ListingEligibility {
  ok: boolean;
  code: string;
  terminal: boolean;
  note: string;
}

export function listingEligibility(listing: any, now = new Date()): ListingEligibility {
  if (!listing) return { ok: false, code: "LISTING_MISSING", terminal: true, note: "The property page no longer exists." };
  if (listing.certification_mode === true) {
    return { ok: false, code: "SYNTHETIC", terminal: true, note: "Synthetic records never carry a paid placement." };
  }
  if (listing.publication_state === "ARCHIVED") {
    return { ok: false, code: "ARCHIVED", terminal: true, note: "The property page was archived." };
  }
  if (listing.authority_confirmed === false) {
    return { ok: false, code: "AUTHORIZATION_REVOKED", terminal: true, note: "Advertising authorization is no longer confirmed." };
  }
  if (["sold", "withdrawn", "expired"].includes(String(listing.listing_status))) {
    return { ok: false, code: `STATUS_${String(listing.listing_status).toUpperCase()}`, terminal: true, note: `The listing is ${listing.listing_status}.` };
  }
  if (listing.publication_state !== "PUBLISHED") {
    return { ok: false, code: "NOT_PUBLISHED", terminal: false, note: "The property page is not published right now." };
  }
  if (!AVAILABLE_LISTING_STATUSES.includes(String(listing.listing_status))) {
    return { ok: false, code: "NOT_AVAILABLE", terminal: false, note: "The listing is not shown as available." };
  }
  if (!isPubliclyActive(listing, now)) {
    return { ok: false, code: "CONFIRMATION_OVERDUE", terminal: false, note: "The listing status has not been reconfirmed in time." };
  }
  return { ok: true, code: "ELIGIBLE", terminal: false, note: "" };
}

// May this listing be sold a package at all? (Publication approval is never bypassed: the page
// must already be published and shown as available by the customer's own approval.)
export function purchasable(listing: any, now = new Date()) {
  const eligibility = listingEligibility(listing, now);
  if (eligibility.ok) return { ok: true, reason: "" };
  return { ok: false, reason: eligibility.note, code: eligibility.code };
}

// ---------------------------------------------------------------------------
// Entitlement maths
// ---------------------------------------------------------------------------
export function promotionEntitlement(promotion: any, now = new Date()) {
  const endsAt = Date.parse(String(promotion?.ends_at || ""));
  const withinTerm = Number.isFinite(endsAt) && endsAt > now.getTime();
  const active = promotion?.status === "active" && withinTerm;
  return {
    active,
    paused: promotion?.status === "paused",
    status: promotion?.status || "none",
    tier: active ? String(promotion.package_tier || "") : "",
    rank: active ? rankFor(promotion.package_tier) : 0,
    placement_label: active ? placementLabelFor(promotion.package_tier) : "",
    days_remaining: active ? Math.max(0, Math.ceil((endsAt - now.getTime()) / DAY_MS)) : 0,
    ends_at: promotion?.ends_at || "",
    activated_at: promotion?.activated_at || "",
  };
}

export async function getPromotion(client: any, promotionId: string) {
  if (!promotionId) return null;
  const found = await client.asServiceRole.entities.PropertyPromotion.filter({ promotion_id: promotionId });
  return rows(found)[0] || null;
}

export async function getPromotionByRecordId(client: any, id: string) {
  if (!id) return null;
  try {
    return await client.asServiceRole.entities.PropertyPromotion.get(id);
  } catch {
    return null;
  }
}

// The promotion currently in force for a listing (active or paused), if any.
export async function livePromotionForListing(client: any, listingId: string) {
  const found = await client.asServiceRole.entities.PropertyPromotion.filter(
    { listing_id: listingId, status: { $in: LIVE_STATUSES } },
    { sort: "-created_at", limit: 20 },
  );
  return rows(found)[0] || null;
}

export async function pendingPromotionForListing(client: any, listingId: string) {
  const found = await client.asServiceRole.entities.PropertyPromotion.filter(
    { listing_id: listingId, status: "pending_payment" },
    { sort: "-created_at", limit: 5 },
  );
  return rows(found)[0] || null;
}

// What this customer would be charged right now.
export function quotePurchase(current: any, tier: string) {
  const target = String(tier || "").toLowerCase();
  const pkg = packageFor(target);
  const entitlement = promotionEntitlement(current);
  if (entitlement.active && entitlement.tier === "plus" && target === "pro") {
    return { amount_cents: UPGRADE_PRICE_CENTS, purchase_type: "upgrade", price_label: priceLabelFromCents(UPGRADE_PRICE_CENTS), package: pkg };
  }
  return { amount_cents: pkg.price_cents, purchase_type: "new", price_label: pkg.price_label, package: pkg };
}

// ---------------------------------------------------------------------------
// Purchase / activation
// ---------------------------------------------------------------------------
export async function createPendingPurchase(
  client: any,
  input: {
    listing: any;
    tier: string;
    clientEmail: string;
    clientName?: string;
    current?: any;
    certificationMode?: boolean;
    amountCentsOverride?: number;
  },
) {
  const now = new Date();
  const listing = input.listing;
  const tier = String(input.tier || "").toLowerCase();
  if (!["plus", "pro"].includes(tier)) throw new Error("UNKNOWN_PACKAGE");
  const check = purchasable(listing, now);
  if (!check.ok) throw new Error(`NOT_PURCHASABLE: ${check.reason}`);

  const current = input.current || (await livePromotionForListing(client, listing.listing_id));
  const quoted = quotePurchase(current, tier);
  if (current && promotionEntitlement(current).active && current.package_tier === tier) {
    throw new Error("ALREADY_ACTIVE: this package is already active for this property");
  }

  const purchaseType = current && promotionEntitlement(current).active ? quoted.purchase_type : (listing.promotion_purchased_before ? "renewal" : quoted.purchase_type);
  const promotion = await client.asServiceRole.entities.PropertyPromotion.create({
    promotion_id: newPromotionId(),
    listing_id: listing.listing_id,
    job_id: listing.job_id || "",
    client_email: String(input.clientEmail || listing.client_email || "").toLowerCase(),
    client_name: sanitizeText(input.clientName || listing.client_name || "", 160),
    package_tier: tier,
    purchase_type: purchaseType,
    term_days: PROMOTION_TERM_DAYS,
    amount_cents: Number(input.amountCentsOverride ?? quoted.amount_cents),
    currency: "usd",
    status: "pending_payment",
    supersedes_promotion_id: current && promotionEntitlement(current).active ? current.promotion_id : "",
    refund_status: "none",
    certification_mode: input.certificationMode === true,
    events: [{ type: "purchase_started", at: now.toISOString(), actor: String(input.clientEmail || ""), note: `${tier} · ${purchaseType}` }],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  return promotion;
}

export async function attachPaymentIntent(client: any, promotion: any, input: { paymentIntentId: string; clientSecret: string }) {
  return await client.asServiceRole.entities.PropertyPromotion.update(promotion.id, {
    stripe_payment_intent_id: input.paymentIntentId,
    stripe_client_secret: input.clientSecret,
    updated_at: new Date().toISOString(),
    events: appendEvent(promotion, { type: "payment_started", actor: "system", note: input.paymentIntentId }),
  });
}

export async function verifyPaymentWithStripe(paymentIntentId: string) {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe lookup failed (${res.status}): ${body?.error?.message || ""}`);
  return body;
}

// Idempotent activation. Safe to call from the webhook and from the customer's own confirmation
// poll at the same time: the second call reports duplicate and changes nothing.
export async function activatePromotion(
  client: any,
  promotionRecordId: string,
  input: { paymentIntentId: string; amountCents: number; actor?: string; source?: string },
) {
  const now = new Date();
  const promotion = await getPromotionByRecordId(client, promotionRecordId);
  if (!promotion) throw new Error("PROMOTION_NOT_FOUND");

  const samePayment = String(promotion.stripe_payment_intent_id || "") === String(input.paymentIntentId || "");
  if (promotion.status === "active" && samePayment) return { promotion, duplicate: true, review: false };
  if (promotion.status !== "pending_payment") return { promotion, duplicate: true, review: false };

  // One payment funds one promotion, ever.
  const others = rows(await client.asServiceRole.entities.PropertyPromotion.filter({ stripe_payment_intent_id: input.paymentIntentId }));
  if (others.some((p: any) => p.id !== promotion.id && LIVE_STATUSES.includes(p.status))) {
    throw new Error("PAYMENT_ALREADY_USED");
  }

  const expected = Number(promotion.amount_cents || 0);
  const paid = Number(input.amountCents || 0);
  if (!Number.isFinite(paid) || paid < expected) {
    // Money was taken, but not the amount quoted: grant nothing and let a person decide.
    const flagged = await client.asServiceRole.entities.PropertyPromotion.update(promotion.id, {
      paid_amount_cents: Number.isFinite(paid) ? paid : 0,
      review_required: true,
      review_reason: `PAID_AMOUNT_MISMATCH: quoted ${expected}, paid ${paid}`,
      updated_at: now.toISOString(),
      events: appendEvent(promotion, { type: "amount_mismatch", actor: "system", note: `${expected} vs ${paid}` }, now),
    });
    return { promotion: flagged, duplicate: false, review: true };
  }

  // No overlapping placements: anything else live on this listing is superseded.
  const liveRows = rows(await client.asServiceRole.entities.PropertyPromotion.filter({ listing_id: promotion.listing_id, status: { $in: LIVE_STATUSES } }));
  for (const other of liveRows.filter((p: any) => p.id !== promotion.id)) {
    await client.asServiceRole.entities.PropertyPromotion.update(other.id, {
      status: "ended",
      ended_at: now.toISOString(),
      ended_reason: "replaced_by_upgrade",
      superseded_by_promotion_id: promotion.promotion_id,
      updated_at: now.toISOString(),
      events: appendEvent(other, { type: "superseded", actor: "system", note: `Replaced by ${promotion.package_tier}` }, now),
    });
  }

  const endsAt = new Date(now.getTime() + PROMOTION_TERM_DAYS * DAY_MS).toISOString();
  const activated = await client.asServiceRole.entities.PropertyPromotion.update(promotion.id, {
    status: "active",
    stripe_payment_intent_id: input.paymentIntentId,
    paid_amount_cents: paid,
    activated_at: now.toISOString(),
    ends_at: endsAt,
    pause_deadline_at: "",
    paused_at: "",
    remaining_ms_at_pause: 0,
    updated_at: now.toISOString(),
    events: appendEvent(promotion, { type: "activated", actor: input.actor || "stripe", note: `${promotion.package_tier} · ${input.source || "payment"}` }, now),
  });

  await purgeDirectory(client, await loadListing(client, promotion.listing_id));
  await notify(client, activated, "activated");
  return { promotion: activated, duplicate: false, review: false };
}

export async function markPaymentFailed(client: any, promotionRecordId: string, input: { paymentIntentId?: string; reason?: string }) {
  const promotion = await getPromotionByRecordId(client, promotionRecordId);
  if (!promotion || promotion.status !== "pending_payment") return { promotion, changed: false };
  const now = new Date();
  const updated = await client.asServiceRole.entities.PropertyPromotion.update(promotion.id, {
    status: "payment_failed",
    ended_at: now.toISOString(),
    ended_reason: "payment_failed",
    updated_at: now.toISOString(),
    events: appendEvent(promotion, { type: "payment_failed", actor: "stripe", note: sanitizeText(input.reason, 300) }, now),
  });
  return { promotion: updated, changed: true };
}

// ---------------------------------------------------------------------------
// Pause / resume / end
// ---------------------------------------------------------------------------
export async function loadListing(client: any, listingId: string) {
  if (!listingId) return null;
  const found = await client.asServiceRole.entities.PropertyListing.filter({ listing_id: listingId });
  return rows(found)[0] || null;
}

export async function purgeDirectory(client: any, listing: any) {
  if (!listing) return { ok: false, skipped: true };
  // Drops the listing page, its media keys AND the shared directory page, which the paid
  // placement changes. Reuses the existing signed purge channel.
  return await purgeListingFromEdge(listing, [DIRECTORY_SLUG]);
}

export async function pausePromotion(client: any, promotion: any, reason: string) {
  const now = new Date();
  const endsAt = Date.parse(String(promotion.ends_at || ""));
  const remaining = Number.isFinite(endsAt) ? Math.max(0, endsAt - now.getTime()) : PROMOTION_TERM_DAYS * DAY_MS;
  const deadline = new Date(now.getTime() + MAX_PAUSE_DAYS * DAY_MS).toISOString();
  const updated = await client.asServiceRole.entities.PropertyPromotion.update(promotion.id, {
    status: "paused",
    paused_at: now.toISOString(),
    remaining_ms_at_pause: remaining,
    pause_deadline_at: deadline,
    updated_at: now.toISOString(),
    events: appendEvent(promotion, { type: "paused", actor: "system", note: reason }, now),
  });
  await purgeDirectory(client, await loadListing(client, promotion.listing_id));
  await notify(client, updated, "paused");
  return updated;
}

export async function resumePromotion(client: any, promotion: any) {
  const now = new Date();
  const remaining = Number(promotion.remaining_ms_at_pause || 0)
    || (Date.parse(String(promotion.ends_at || "")) - now.getTime());
  const endsAt = new Date(now.getTime() + Math.max(remaining, DAY_MS)).toISOString();
  const updated = await client.asServiceRole.entities.PropertyPromotion.update(promotion.id, {
    status: "active",
    ends_at: endsAt,
    paused_at: "",
    pause_deadline_at: "",
    remaining_ms_at_pause: 0,
    updated_at: now.toISOString(),
    events: appendEvent(promotion, { type: "resumed", actor: "system", note: "Listing eligible again; remaining days restored" }, now),
  });
  await purgeDirectory(client, await loadListing(client, promotion.listing_id));
  await notify(client, updated, "resumed");
  return updated;
}

export async function endPromotion(
  client: any,
  promotion: any,
  input: { status: "expired" | "ended" | "refunded"; reason: string; actor?: string; review?: boolean },
) {
  const now = new Date();
  const listing = await loadListing(client, promotion.listing_id);
  const updated = await client.asServiceRole.entities.PropertyPromotion.update(promotion.id, {
    status: input.status,
    ended_at: now.toISOString(),
    ended_reason: input.reason,
    review_required: input.review === true ? true : promotion.review_required === true,
    review_reason: input.review === true ? sanitizeText(input.reason, 300) : promotion.review_reason || "",
    updated_at: now.toISOString(),
    events: appendEvent(promotion, { type: input.status, actor: input.actor || "system", note: input.reason }, now),
  });
  await purgeDirectory(client, listing);
  await notify(client, updated, "ended");
  return updated;
}

// Refusal is never automatic: this records the ADMINISTRATOR's decision.
export async function recordRefund(
  client: any,
  promotion: any,
  input: { refundType: "full" | "partial" | "declined"; amountCents?: number; reason: string; approvedBy: string; stripeRefundId?: string },
) {
  const now = new Date();
  const full = input.refundType === "full";
  const amount = full ? Number(promotion.paid_amount_cents || promotion.amount_cents || 0) : Math.max(0, Number(input.amountCents || 0));
  const patch: Record<string, any> = {
    refund_status: input.refundType === "declined" ? "declined" : input.refundType,
    refund_amount_cents: input.refundType === "declined" ? 0 : amount,
    refund_reason: sanitizeText(input.reason, 500),
    refund_decided_at: now.toISOString(),
    refund_decided_by: sanitizeText(input.approvedBy, 160),
    refund_stripe_id: sanitizeText(input.stripeRefundId || "", 160),
    updated_at: now.toISOString(),
    events: appendEvent(promotion, { type: `refund_${input.refundType}`, actor: input.approvedBy, note: `${amount} · ${sanitizeText(input.reason, 200)}` }, now),
  };
  // A full refund removes the paid benefit immediately. A partial refund leaves the remaining,
  // paid-for days in force.
  if (full) {
    patch.status = "refunded";
    patch.ended_at = now.toISOString();
    patch.ended_reason = "refunded";
  }
  const updated = await client.asServiceRole.entities.PropertyPromotion.update(promotion.id, patch);
  if (full) {
    await purgeDirectory(client, await loadListing(client, promotion.listing_id));
    await notify(client, updated, "refunded");
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Reconciliation — keeps a promotion honest against the listing it promotes.
// ---------------------------------------------------------------------------
export async function reconcilePromotion(client: any, promotion: any, listing: any, now = new Date()) {
  if (!promotion || !LIVE_STATUSES.includes(promotion.status)) return { changed: false, action: "none" };
  const eligibility = listingEligibility(listing, now);

  if (eligibility.ok) {
    if (promotion.status === "paused") {
      await resumePromotion(client, promotion);
      return { changed: true, action: "resumed" };
    }
    return { changed: false, action: "none" };
  }

  if (eligibility.terminal) {
    await endPromotion(client, promotion, {
      status: "ended",
      reason: eligibility.code.toLowerCase(),
      actor: "system",
    });
    return { changed: true, action: "terminated" };
  }

  if (promotion.status === "active") {
    await pausePromotion(client, promotion, eligibility.code);
    return { changed: true, action: "paused" };
  }

  // Paused: the customer keeps their remaining days for at most 30 calendar days.
  const deadline = Date.parse(String(promotion.pause_deadline_at || ""));
  if (Number.isFinite(deadline) && now.getTime() > deadline) {
    await endPromotion(client, promotion, {
      status: "ended",
      reason: "ineligible_too_long",
      review: true,
      actor: "system",
    });
    return { changed: true, action: "ended_for_ineligibility" };
  }
  return { changed: false, action: "paused" };
}

// ---------------------------------------------------------------------------
// Reporting — real recorded data only. Nothing here estimates or extrapolates.
// ---------------------------------------------------------------------------
export async function promotionPerformance(client: any, listing: any, window: { startIso: string; endIso: string }) {
  const startDay = String(window.startIso).slice(0, 10);
  const endDay = String(window.endIso).slice(0, 10);
  const listingId = listing?.listing_id || "";

  const trafficRows = rows(
    await client.asServiceRole.entities.PropertyTrafficDaily.filter(
      { listing_id: listingId, day: { $gte: startDay, $lte: endDay } },
      { limit: 500 },
    ),
  );

  const byChannel: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  let views = 0;
  for (const row of trafficRows) {
    const count = Number(row.views || 0);
    views += count;
    const channel = String(row.channel || "direct");
    byChannel[channel] = (byChannel[channel] || 0) + count;
    const source = String(row.source_label || channel);
    bySource[source] = (bySource[source] || 0) + count;
    const day = String(row.day || "");
    if (day) byDay[day] = (byDay[day] || 0) + count;
  }

  const inquiryRows = rows(
    await client.asServiceRole.entities.PropertyInquiry.filter({ listing_id: listingId }, { sort: "-created_date", limit: 200 }),
  ).filter((inquiry: any) => {
    const at = Date.parse(String(inquiry.created_at || inquiry.created_date || ""));
    return Number.isFinite(at) && at >= Date.parse(window.startIso) && at <= Date.parse(window.endIso);
  });

  const leadsByChannel: Record<string, number> = {};
  for (const inquiry of inquiryRows) {
    const channel = String(inquiry.channel || "direct");
    leadsByChannel[channel] = (leadsByChannel[channel] || 0) + 1;
  }

  // Weekly buckets (Monday-start) for Pro's weekly summaries.
  const weekly: { week_start: string; views: number; inquiries: number }[] = [];
  const weekIndexOf = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return "";
    const offset = (d.getUTCDay() + 6) % 7;
    return new Date(d.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
  };
  const weekViews: Record<string, number> = {};
  for (const [day, count] of Object.entries(byDay)) {
    const week = weekIndexOf(day);
    if (week) weekViews[week] = (weekViews[week] || 0) + count;
  }
  const weekInquiries: Record<string, number> = {};
  for (const inquiry of inquiryRows) {
    const day = String(inquiry.created_at || inquiry.created_date || "").slice(0, 10);
    const week = weekIndexOf(day);
    if (week) weekInquiries[week] = (weekInquiries[week] || 0) + 1;
  }
  for (const week of [...new Set([...Object.keys(weekViews), ...Object.keys(weekInquiries)])].sort()) {
    weekly.push({ week_start: week, views: weekViews[week] || 0, inquiries: weekInquiries[week] || 0 });
  }

  return {
    window: { start: startDay, end: endDay },
    views,
    inquiries: inquiryRows.length,
    conversion_rate: views > 0 ? Number(((inquiryRows.length / views) * 100).toFixed(2)) : 0,
    views_by_channel: byChannel,
    views_by_source: bySource,
    views_by_day: Object.entries(byDay).sort().map(([day, count]) => ({ day, views: count })),
    inquiries_by_channel: leadsByChannel,
    weekly,
    // Advertising metrics are deliberately absent: no verified provider data exists.
    advertising_metrics: { available: false, reason: "No advertising provider is connected. Arriv does not estimate or infer impressions, rankings or ad results." },
  };
}

// ---------------------------------------------------------------------------
// Customer notices
// ---------------------------------------------------------------------------
const KIND_COPY: Record<string, { subject: (l: any, p: any) => string; lines: (l: any, p: any) => string[] }> = {
  activated: {
    subject: (l, p) => `${placementLabelFor(p.package_tier)} placement is live — ${l?.property_address || "your property"}`,
    lines: (l, p) => [
      `Your ${packageFor(p.package_tier).name} package is active.`,
      `Placement: ${placementLabelFor(p.package_tier)} in the Arriv property directory.`,
      `Promotional period: ${PROMOTION_TERM_DAYS} days, ending ${String(p.ends_at || "").slice(0, 10)}.`,
      `Your public property page: ${propertyPageUrl(l?.public_slug || "")}`,
      "Your free property page is unchanged and stays published regardless of this package.",
      "Marketing graphics, captions and your performance report are in the property page builder.",
    ],
  },
  paused: {
    subject: (l) => `Your placement is paused — ${l?.property_address || "your property"}`,
    lines: (l, p) => [
      "Your property page is temporarily not shown as available, so its paid placement has been paused.",
      "Your remaining promotional days are held for you and will start again the moment the page is eligible.",
      `The placement pauses for at most ${MAX_PAUSE_DAYS} days. Confirming the listing status restores it.`,
      `Your property page: ${propertyPageUrl(l?.public_slug || "")}`,
      `Remaining days held: ${Math.max(0, Math.ceil(Number(p.remaining_ms_at_pause || 0) / DAY_MS))}.`,
    ],
  },
  resumed: {
    subject: (l) => `Your placement is live again — ${l?.property_address || "your property"}`,
    lines: (l, p) => [
      "Your property page is eligible again and your paid placement has resumed.",
      `Promotional period now ends ${String(p.ends_at || "").slice(0, 10)}.`,
      `Your property page: ${propertyPageUrl(l?.public_slug || "")}`,
    ],
  },
  expiring: {
    subject: (l) => `Your placement ends soon — ${l?.property_address || "your property"}`,
    lines: (l, p) => [
      "Your promotional period is ending in three days.",
      `Ends: ${String(p.ends_at || "").slice(0, 10)}.`,
      "Your free property page remains published. You can renew for another 30 days from the builder if you would like the placement to continue.",
    ],
  },
  unpublish_warning: {
    subject: (l) => `Action needed to keep your property page live — ${l?.property_address || "your property"}`,
    lines: (l) => [
      "The listing status on your property page has not been confirmed recently.",
      `Pages are removed from the directory after ${STATUS_CONFIRMATION_WINDOW_DAYS} days without confirmation, and unpublished after ${STATUS_AUTO_DEACTIVATE_AFTER_DAYS} days.`,
      "You have an active paid placement. Confirming the listing status keeps both the page and the placement live.",
      `Open your property page to confirm: ${propertyPageUrl(l?.public_slug || "")}`,
    ],
  },
  ended: {
    subject: (l) => `Your promotional period has ended — ${l?.property_address || "your property"}`,
    lines: (l, p) => [
      "Your promotional period has ended.",
      `Your free property page is unaffected and remains published under its usual rules.`,
      `Reason recorded: ${String(p.ended_reason || "period ended").replace(/_/g, " ")}.`,
      `Your property page: ${propertyPageUrl(l?.public_slug || "")}`,
    ],
  },
  refunded: {
    subject: (l) => `Refund processed — ${l?.property_address || "your property"}`,
    lines: (l, p) => [
      `A refund of ${priceLabelFromCents(Number(p.refund_amount_cents || 0))} has been recorded for your ${packageFor(p.package_tier).name} package.`,
      "The paid placement has been removed. Your free property page is unaffected.",
    ],
  },
};

export async function notify(client: any, promotion: any, kind: string, extra: { listing?: any } = {}) {
  if (!promotion || promotion.certification_mode === true) return { ok: true, skipped: true };
  const copy = KIND_COPY[kind];
  if (!copy) return { ok: false, skipped: true };
  const listing = extra.listing || (await loadListing(client, promotion.listing_id));

  const stampField: Record<string, string> = {
    activated: "notified_activated_at",
    expiring: "notified_expiring_at",
    ended: "notified_ended_at",
    unpublish_warning: "notified_unpublish_warning_at",
  };
  const field = stampField[kind];
  if (field && promotion[field]) return { ok: true, skipped: true };

  const to = String(promotion.client_email || "").toLowerCase();
  if (!to.includes("@")) return { ok: false, skipped: true };

  const lines = copy.lines(listing, promotion).filter(Boolean);
  const body = [
    `Hello${promotion.client_name ? ` ${String(promotion.client_name).split(" ")[0]}` : ""},`,
    "",
    ...lines,
    "",
    "Arriv Estate Media",
    "Marketing packages are promotional placements and deliverables. They do not guarantee traffic, search ranking, leads or advertising results.",
  ].join("\n");

  try {
    const sent = await sendBrevoEmail({
      to,
      subject: copy.subject(listing, promotion),
      textContent: body,
      senderEmail: BOOKINGS_SENDER_EMAIL,
      senderName: "Arriv Estate Media",
    });
    if (field) {
      await client.asServiceRole.entities.PropertyPromotion.update(promotion.id, { [field]: new Date().toISOString() });
    }
    return { ok: true, messageId: sent?.messageId || "" };
  } catch (error: any) {
    // A notice must never break a state change. The failure stays visible in the audit history.
    try {
      await client.asServiceRole.entities.PropertyPromotion.update(promotion.id, {
        events: appendEvent(promotion, { type: `notice_failed_${kind}`, actor: "system", note: String(error?.message || error) }),
      });
    } catch { /* ignore */ }
    return { ok: false, error: String(error?.message || error) };
  }
}