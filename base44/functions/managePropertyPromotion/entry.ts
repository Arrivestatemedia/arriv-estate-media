import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { actorOwnsListing, resolvePropertyActor } from '../../shared/propertyActor.ts';
import {
  ADVERTISING_UNAVAILABLE_NOTE,
  PACKAGES,
  REFUND_DISCLOSURE,
  REFUND_POLICY,
  isCheckoutEnabled,
  priceLabelFromCents,
} from '../../shared/propertyPackages.ts';
import {
  attachPaymentIntent,
  createPendingPurchase,
  endPromotion,
  getPromotion,
  livePromotionForListing,
  loadListing,
  pendingPromotionForListing,
  promotionEntitlement,
  promotionPerformance,
  purchasable,
  quotePurchase,
  verifyPaymentWithStripe,
  activatePromotion,
} from '../../shared/propertyPromotionEngine.ts';
import { DAY_MS } from '../../shared/propertyPackages.ts';

// Customer-facing package management for ONE property page.
//
// Every action re-derives the caller from the request, and every purchase decision is checked
// against the listing's own client_email on the server. Nothing here can grant a benefit: a
// promotion only becomes active after the payment is verified with Stripe.

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

async function listingFor(client: any, listingId: string) {
  if (!listingId) return null;
  const found = await client.asServiceRole.entities.PropertyListing.filter({ listing_id: listingId });
  return rows(found)[0] || null;
}

async function createStripePaymentIntent(opts: {
  amountCents: number;
  promotionId: string;
  listingId: string;
  tier: string;
  clientEmail: string;
  address: string;
}) {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) throw new Error("Stripe is not configured");

  const form = new URLSearchParams({
    amount: String(opts.amountCents),
    currency: "usd",
    "automatic_payment_methods[enabled]": "true",
    description: `Arriv Estate Media — property marketing package (${opts.tier})`,
    "metadata[purpose]": "property_package_purchase",
    "metadata[promotion_id]": opts.promotionId,
    "metadata[listing_id]": opts.listingId,
    "metadata[tier]": opts.tier,
    "metadata[client_email]": opts.clientEmail,
  });
  if (String(opts.clientEmail || "").includes("@")) form.set("receipt_email", opts.clientEmail);

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe could not start the payment (${res.status}): ${body?.error?.message || ""}`);
  return body;
}

function reportWindow(promotion: any, now = new Date()) {
  if (promotion?.activated_at) {
    const start = String(promotion.activated_at);
    const endCandidate = Date.parse(String(promotion.ends_at || ""));
    const end = Number.isFinite(endCandidate) ? new Date(Math.min(now.getTime(), endCandidate)).toISOString() : now.toISOString();
    return { startIso: start, endIso: end };
  }
  return { startIso: new Date(now.getTime() - 30 * DAY_MS).toISOString(), endIso: now.toISOString() };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "overview");
    const now = new Date();

    const actor = await resolvePropertyActor(base44, body);
    const listing = await listingFor(base44, String(body.listingId || body.listing_id || ""));

    if (action === "overview") {
      if (!listing) return Response.json({ ok: false, error: "PROPERTY_NOT_FOUND" }, { status: 404 });
      if (!actorOwnsListing(listing, actor)) {
        return Response.json({ ok: false, error: "FORBIDDEN", message: "This property page belongs to another account." }, { status: 403 });
      }

      const current = await livePromotionForListing(base44, listing.listing_id);
      const pending = await pendingPromotionForListing(base44, listing.listing_id);
      const entitlement = promotionEntitlement(current, now);
      const saleCheck = purchasable(listing, now);
      const history = rows(
        await base44.asServiceRole.entities.PropertyPromotion.filter({ listing_id: listing.listing_id }, { sort: "-created_date", limit: 25 }),
      ).filter((p: any) => p.certification_mode !== true);

      const plusQuote = quotePurchase(current, "plus");
      const proQuote = quotePurchase(current, "pro");
      const performance = await promotionPerformance(base44, listing, reportWindow(current, now));
      const checkoutEnabled = await isCheckoutEnabled(base44);

      return Response.json({
        ok: true,
        checkout_enabled: checkoutEnabled,
        checkout_note: checkoutEnabled
          ? "Paid packages can be purchased now."
          : "Paid checkout is not open yet. You can review the packages; nothing will be charged.",
        listing: {
          listing_id: listing.listing_id,
          property_address: listing.property_address,
          city: listing.city || "",
          state: listing.state || "",
          public_slug: listing.public_slug,
          public_url: listing.public_url || "",
          publication_state: listing.publication_state,
          listing_status: listing.listing_status,
          purchasable: saleCheck.ok,
          not_purchasable_reason: saleCheck.reason,
        },
        packages: PACKAGES,
        entitlement,
        promotion: current
          ? {
              promotion_id: current.promotion_id,
              package_tier: current.package_tier,
              package_name: current.package_tier === "pro" ? "Visibility Pro" : "Visibility Plus",
              status: current.status,
              purchase_type: current.purchase_type,
              activated_at: current.activated_at,
              ends_at: current.ends_at,
              days_remaining: entitlement.days_remaining,
              amount_cents: current.amount_cents,
              price_label: priceLabelFromCents(Number(current.amount_cents || 0)),
              refund_status: current.refund_status || "none",
              placement_label: entitlement.placement_label,
            }
          : null,
        pending_payment: pending ? { promotion_id: pending.promotion_id, package_tier: pending.package_tier, amount_cents: pending.amount_cents } : null,
        quotes: {
          plus: { amount_cents: plusQuote.amount_cents, price_label: plusQuote.price_label, purchase_type: plusQuote.purchase_type },
          pro: { amount_cents: proQuote.amount_cents, price_label: proQuote.price_label, purchase_type: proQuote.purchase_type },
        },
        can_purchase: checkoutEnabled && saleCheck.ok && !entitlement.active && !entitlement.paused,
        can_upgrade: checkoutEnabled && entitlement.active && entitlement.tier === "plus",
        can_renew: checkoutEnabled && saleCheck.ok && !entitlement.active && !entitlement.paused && history.length > 0,
        history: history.map((p: any) => ({
          promotion_id: p.promotion_id,
          package_tier: p.package_tier,
          status: p.status,
          purchase_type: p.purchase_type,
          amount_cents: p.amount_cents,
          activated_at: p.activated_at || "",
          ends_at: p.ends_at || "",
          ended_reason: p.ended_reason || "",
          refund_status: p.refund_status || "none",
          created_at: p.created_at || p.created_date,
        })),
        performance,
        refund_policy: REFUND_POLICY,
        disclosures: [REFUND_DISCLOSURE, ADVERTISING_UNAVAILABLE_NOTE],
      });
    }

    // Everything below changes money or entitlement, so it is the owner acting on their own page.
    if (!listing) return Response.json({ ok: false, error: "PROPERTY_NOT_FOUND" }, { status: 404 });
    if (!actorOwnsListing(listing, actor) || actor.isAdmin) {
      return Response.json({
        ok: false,
        error: "FORBIDDEN",
        message: "Package purchases must be made by the customer who owns this property page.",
      }, { status: 403 });
    }

    if (action === "start_purchase") {
      const checkoutEnabled = await isCheckoutEnabled(base44);
      if (!checkoutEnabled) {
        return Response.json({
          ok: false,
          checkout_disabled: true,
          message: "Paid checkout is not open yet. Please review the packages and try again once billing is authorized.",
        });
      }

      const tier = String(body.tier || "").toLowerCase();
      if (!["plus", "pro"].includes(tier)) return Response.json({ ok: false, error: "UNKNOWN_PACKAGE" }, { status: 400 });

      const current = await livePromotionForListing(base44, listing.listing_id);
      const entitlement = promotionEntitlement(current, now);
      if (entitlement.active && entitlement.tier === tier) {
        return Response.json({ ok: false, error: "ALREADY_ACTIVE", message: `Your ${tier === "pro" ? "Visibility Pro" : "Visibility Plus"} package is already active.` });
      }
      if (entitlement.active && entitlement.tier === "pro" && tier === "plus") {
        return Response.json({ ok: false, error: "ALREADY_HIGHER", message: "Visibility Pro already includes everything in Plus." });
      }

      const promotion = await createPendingPurchase(base44, {
        listing,
        tier,
        clientEmail: actor.clientEmail,
        clientName: listing.client_name || "",
        current,
      });

      const intent = await createStripePaymentIntent({
        amountCents: Number(promotion.amount_cents || 0),
        promotionId: promotion.promotion_id,
        listingId: listing.listing_id,
        tier,
        clientEmail: actor.clientEmail,
        address: String(listing.property_address || ""),
      });

      await attachPaymentIntent(base44, promotion, {
        paymentIntentId: String(intent.id || ""),
        clientSecret: String(intent.client_secret || ""),
      });

      return Response.json({
        ok: true,
        promotion_id: promotion.promotion_id,
        payment_intent_id: intent.id,
        client_secret: intent.client_secret,
        amount_cents: promotion.amount_cents,
        price_label: priceLabelFromCents(Number(promotion.amount_cents || 0)),
        tier,
      });
    }

    if (action === "confirm_purchase") {
      // Belt and braces beside the webhook: the customer's browser confirms, and the SERVER
      // verifies the payment with Stripe before granting anything. Both paths are idempotent.
      const promotionId = String(body.promotionId || body.promotion_id || "");
      const promotion = await getPromotion(base44, promotionId);
      if (!promotion || promotion.listing_id !== listing.listing_id) {
        return Response.json({ ok: false, error: "PROMOTION_NOT_FOUND" }, { status: 404 });
      }
      const intentId = String(body.paymentIntentId || promotion.stripe_payment_intent_id || "");
      if (!intentId) return Response.json({ ok: false, error: "NO_PAYMENT" }, { status: 400 });

      const intent = await verifyPaymentWithStripe(intentId);
      if (intent?.status !== "succeeded") {
        return Response.json({ ok: false, pending: true, status: intent?.status || "unknown", message: "The payment has not completed yet." });
      }
      const result = await activatePromotion(base44, promotion.id, {
        paymentIntentId: intentId,
        amountCents: Number(intent.amount_received ?? intent.amount ?? 0),
        actor: actor.clientEmail,
        source: "customer_confirmation",
      });
      return Response.json({
        ok: true,
        activated: result.promotion?.status === "active",
        review: result.review === true,
        promotion: result.promotion
          ? {
              promotion_id: result.promotion.promotion_id,
              status: result.promotion.status,
              package_tier: result.promotion.package_tier,
              ends_at: result.promotion.ends_at,
            }
          : null,
      });
    }

    if (action === "cancel_promotion") {
      const promotion = await getPromotion(base44, String(body.promotionId || body.promotion_id || ""));
      if (!promotion || promotion.listing_id !== listing.listing_id) {
        return Response.json({ ok: false, error: "PROMOTION_NOT_FOUND" }, { status: 404 });
      }
      if (!["active", "paused", "pending_payment"].includes(promotion.status)) {
        return Response.json({ ok: false, error: "NOT_ACTIVE" });
      }
      await endPromotion(base44, promotion, {
        status: "ended",
        reason: promotion.status === "pending_payment" ? "checkout_abandoned" : "voluntary_cancellation",
        actor: actor.clientEmail,
      });
      return Response.json({
        ok: true,
        message: "The placement has been ended. Your free property page is unaffected.",
        refund_note: "A cancellation does not issue an automatic refund. Our refund terms are shown on this page, and any refund requires an administrator's decision.",
        refund_policy: REFUND_POLICY,
      });
    }

    return Response.json({ ok: false, error: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (error: any) {
    const message = String(error?.message || error);
    if (message.startsWith("NOT_PURCHASABLE")) {
      return Response.json({ ok: false, error: "NOT_PURCHASABLE", message: message.split(":").slice(1).join(":").trim() }, { status: 409 });
    }
    if (message.startsWith("ALREADY_ACTIVE")) return Response.json({ ok: false, error: "ALREADY_ACTIVE", message }, { status: 409 });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});