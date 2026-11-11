import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolvePropertyActor } from '../../shared/propertyActor.ts';
import {
  CHECKOUT_GATE_KEY,
  REFUND_POLICY,
  isCheckoutEnabled,
  priceLabelFromCents,
  refundAdvice,
} from '../../shared/propertyPackages.ts';
import {
  endPromotion,
  getPromotion,
  loadListing,
  promotionEntitlement,
  promotionPerformance,
  recordRefund,
  releasePaymentAuthorization,
} from '../../shared/propertyPromotionEngine.ts';

// Administrative control over package purchases. Every action re-checks the caller server-side;
// nothing here trusts a flag sent by the browser.

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");
    const now = new Date();

    const actor = await resolvePropertyActor(base44, body);
    if (!actor.isAdmin) {
      return Response.json({ ok: false, error: "FORBIDDEN", message: "Administrator access required." }, { status: 403 });
    }

    if (action === "checkout_gate") {
      if (typeof body.enabled === "boolean") {
        const existing = rows(await base44.asServiceRole.entities.AppSetting.filter({ key: CHECKOUT_GATE_KEY }));
        const value = body.enabled ? "true" : "false";
        if (existing[0]) {
          await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value });
        } else {
          await base44.asServiceRole.entities.AppSetting.create({ key: CHECKOUT_GATE_KEY, value });
        }
      }
      return Response.json({
        ok: true,
        checkout_enabled: await isCheckoutEnabled(base44),
        note: "Live package checkout is controlled by this single switch. It is closed until an administrator opens it.",
      });
    }

    if (action === "list") {
      const filter: Record<string, any> = { certification_mode: { $ne: true } };
      if (body.status) filter.status = String(body.status);
      if (body.tier) filter.package_tier = String(body.tier);

      const promotions = rows(
        await base44.asServiceRole.entities.PropertyPromotion.filter(filter, { sort: "-created_date", limit: 200 }),
      );

      const listingIds = [...new Set(promotions.map((p: any) => p.listing_id).filter(Boolean))];
      const listings = listingIds.length
        ? rows(await base44.asServiceRole.entities.PropertyListing.filter({ listing_id: { $in: listingIds } }, { limit: listingIds.length }))
        : [];
      const listingById = new Map(listings.map((l: any) => [l.listing_id, l]));

      const rowFor = (p: any) => {
        const listing = listingById.get(p.listing_id);
        const entitlement = promotionEntitlement(p, now);
        return {
          promotion_id: p.promotion_id,
          listing_id: p.listing_id,
          property_address: listing?.property_address || "(page removed)",
          public_slug: listing?.public_slug || "",
          client_email: p.client_email,
          package_tier: p.package_tier,
          purchase_type: p.purchase_type,
          status: p.status,
          amount_cents: p.amount_cents,
          price_label: priceLabelFromCents(Number(p.amount_cents || 0)),
          paid_amount_cents: p.paid_amount_cents ?? null,
          activated_at: p.activated_at || "",
          ends_at: p.ends_at || "",
          days_remaining: entitlement.days_remaining,
          placement_label: entitlement.placement_label,
          refund_status: p.refund_status || "none",
          review_required: p.review_required === true,
          review_reason: p.review_reason || "",
          ended_reason: p.ended_reason || "",
          created_at: p.created_at || p.created_date,
        };
      };

      const rowsOut = promotions.map(rowFor);
      const totals = {
        purchases: rowsOut.length,
        active: rowsOut.filter((r: any) => r.status === "active").length,
        paused: rowsOut.filter((r: any) => r.status === "paused").length,
        pending_payment: rowsOut.filter((r: any) => r.status === "pending_payment").length,
        authorized: rowsOut.filter((r: any) => r.status === "authorized").length,
        failed_payments: rowsOut.filter((r: any) => r.status === "payment_failed").length,
        refunds: rowsOut.filter((r: any) => ["full", "partial"].includes(r.refund_status)).length,
        review_required: rowsOut.filter((r: any) => r.review_required).length,
        gross_cents: rowsOut
          .filter((r: any) => ["active", "paused", "expired", "ended"].includes(r.status))
          .reduce((sum: number, r: any) => sum + Number(r.paid_amount_cents ?? r.amount_cents ?? 0), 0),
        refunded_cents: promotions.reduce((sum: number, p: any) => sum + Number(p.refund_amount_cents || 0), 0),
        plus: rowsOut.filter((r: any) => r.package_tier === "plus").length,
        pro: rowsOut.filter((r: any) => r.package_tier === "pro").length,
      };

      return Response.json({
        ok: true,
        checkout_enabled: await isCheckoutEnabled(base44),
        promotions: rowsOut,
        totals,
        refund_policy: REFUND_POLICY,
      });
    }

    if (action === "detail") {
      const promotion = await getPromotion(base44, String(body.promotionId || body.promotion_id || ""));
      if (!promotion) return Response.json({ ok: false, error: "PROMOTION_NOT_FOUND" }, { status: 404 });
      const listing = await loadListing(base44, promotion.listing_id);
      const windowStart = promotion.activated_at || promotion.created_at || new Date(now.getTime() - 30 * 86400000).toISOString();
      const windowEnd = promotion.ends_at && Date.parse(promotion.ends_at) < now.getTime() ? promotion.ends_at : now.toISOString();
      const performance = await promotionPerformance(base44, listing || { listing_id: promotion.listing_id }, {
        startIso: windowStart,
        endIso: windowEnd,
      });
      return Response.json({
        ok: true,
        promotion,
        listing: listing
          ? {
              listing_id: listing.listing_id,
              property_address: listing.property_address,
              public_slug: listing.public_slug,
              publication_state: listing.publication_state,
              listing_status: listing.listing_status,
              client_email: listing.client_email,
            }
          : null,
        entitlement: promotionEntitlement(promotion, now),
        refund_advice: refundAdvice(promotion, now),
        performance,
      });
    }

    if (action === "refund_decision") {
      const promotion = await getPromotion(base44, String(body.promotionId || body.promotion_id || ""));
      if (!promotion) return Response.json({ ok: false, error: "PROMOTION_NOT_FOUND" }, { status: 404 });

      const refundType = String(body.refundType || body.refund_type || "").toLowerCase();
      if (!["full", "partial", "declined"].includes(refundType)) {
        return Response.json({ ok: false, error: "INVALID_REFUND_TYPE" }, { status: 400 });
      }
      const reason = String(body.reason || "").trim();
      if (!reason) return Response.json({ ok: false, error: "REASON_REQUIRED", message: "A refund decision needs a recorded reason." }, { status: 400 });

      let stripeRefundId = "";
      // A real Stripe refund is only issued when the administrator explicitly asks for it in the
      // same action; recording a decision never moves money by itself.
      if (body.issue_refund === true && refundType !== "declined") {
        const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
        const intentId = String(promotion.stripe_payment_intent_id || "");
        if (!key || !intentId) {
          return Response.json({ ok: false, error: "NO_PAYMENT_TO_REFUND", message: "This promotion has no verified payment to refund." }, { status: 409 });
        }
        const amount = refundType === "full"
          ? Number(promotion.paid_amount_cents || promotion.amount_cents || 0)
          : Math.max(0, Number(body.amountCents || body.amount_cents || 0));
        if (amount <= 0) return Response.json({ ok: false, error: "AMOUNT_REQUIRED" }, { status: 400 });
        const form = new URLSearchParams({ payment_intent: intentId, amount: String(amount) });
        const res = await fetch("https://api.stripe.com/v1/refunds", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: form,
          signal: AbortSignal.timeout(20000),
        });
        const refund = await res.json().catch(() => ({}));
        if (!res.ok) {
          return Response.json({ ok: false, error: "STRIPE_REFUND_FAILED", message: refund?.error?.message || `Stripe returned ${res.status}` }, { status: 502 });
        }
        stripeRefundId = String(refund.id || "");
      }

      const updated = await recordRefund(base44, promotion, {
        refundType: refundType as "full" | "partial" | "declined",
        amountCents: Number(body.amountCents || body.amount_cents || 0),
        reason,
        approvedBy: actor.email || "administrator",
        stripeRefundId,
      });

      return Response.json({
        ok: true,
        promotion: updated,
        money_moved: !!stripeRefundId,
        note: stripeRefundId
          ? "Refund issued with Stripe and recorded. The placement was removed immediately."
          : "Decision recorded. No money was moved by this action.",
      });
    }

    if (action === "force_expire") {
      const promotion = await getPromotion(base44, String(body.promotionId || body.promotion_id || ""));
      if (!promotion) return Response.json({ ok: false, error: "PROMOTION_NOT_FOUND" }, { status: 404 });
      if (!["active", "paused", "pending_payment", "authorized"].includes(promotion.status)) {
        return Response.json({ ok: false, error: "NOT_LIVE", message: "This promotion is not live." });
      }
      // Ending an uncharged reservation releases the card hold instead of charging for it.
      if (promotion.status === "authorized") await releasePaymentAuthorization(promotion);
      const updated = await endPromotion(base44, promotion, {
        status: "ended",
        reason: String(body.reason || "administrative_end"),
        actor: actor.email || "administrator",
      });
      return Response.json({ ok: true, promotion: updated });
    }

    if (action === "clear_review") {
      const promotion = await getPromotion(base44, String(body.promotionId || body.promotion_id || ""));
      if (!promotion) return Response.json({ ok: false, error: "PROMOTION_NOT_FOUND" }, { status: 404 });
      const updated = await base44.asServiceRole.entities.PropertyPromotion.update(promotion.id, {
        review_required: false,
        review_reason: "",
      });
      return Response.json({ ok: true, promotion: updated });
    }

    return Response.json({ ok: false, error: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
});