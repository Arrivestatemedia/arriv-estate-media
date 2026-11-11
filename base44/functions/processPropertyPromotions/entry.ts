import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolvePropertyActor } from '../../shared/propertyActor.ts';
import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';
import {
  STATUS_AUTO_DEACTIVATE_AFTER_DAYS,
  STATUS_CONFIRMATION_WINDOW_DAYS,
  propertyPageUrl,
} from '../../shared/propertyVisibility.ts';
import { DAY_MS, priceLabelFromCents } from '../../shared/propertyPackages.ts';
import {
  capturePromotionPayment,
  endPromotion,
  listingEligibility,
  livePromotionForListing,
  loadListing,
  markPaymentFailed,
  notify,
  promotionEntitlement,
  promotionPerformance,
  reconcilePromotion,
  releasePaymentAuthorization,
  activatePromotion,
  getPromotion,
} from '../../shared/propertyPromotionEngine.ts';

// The scheduled pass behind paid placements, plus the two webhook entry points.
//
// It is the ONLY thing that lets time change a promotion: expiry, pausing for ineligibility,
// resuming, terminating an unsellable listing, the warnings a customer gets before their page is
// unpublished, and the automated reports. It never publishes, approves or unpublishes a property
// page — the Phase 1 lifecycle sweep owns that, and this pass only reacts to it.

const ABANDONED_PAYMENT_HOURS = 24;
const EXPIRING_WINDOW_MS = 3 * DAY_MS;
const WEEK_MS = 7 * DAY_MS;

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function daysSince(iso: string | undefined): number {
  const t = Date.parse(String(iso || ""));
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / DAY_MS;
}

async function sendSummaryEmail(promotion: any, listing: any, performance: any, kind: "weekly" | "final") {
  const to = String(promotion.client_email || "").toLowerCase();
  if (!to.includes("@") || promotion.certification_mode === true) return { ok: false, skipped: true };
  const address = String(listing?.property_address || "your property");
  const subject = kind === "weekly"
    ? `Weekly marketing summary — ${address}`
    : `Your ${promotion.term_days || 30}-day marketing summary — ${address}`;

  const lines = [
    `Hello${promotion.client_name ? ` ${String(promotion.client_name).split(" ")[0]}` : ""},`,
    "",
    kind === "weekly" ? "Here is this week's activity on your property page." : "Your promotional period has completed. Here is what it produced.",
    "",
    `Property page views: ${performance.views}`,
    `Buyer inquiries: ${performance.inquiries}`,
    `Inquiry rate: ${performance.conversion_rate}% of visitors`,
    `Views by channel: ${Object.entries(performance.views_by_channel || {}).map(([k, v]) => `${k} ${v}`).join(", ") || "none recorded"}`,
    `Inquiries by channel: ${Object.entries(performance.inquiries_by_channel || {}).map(([k, v]) => `${k} ${v}`).join(", ") || "none recorded"}`,
    "",
    `Your property page: ${propertyPageUrl(listing?.public_slug || "")}`,
    "These are the page views and inquiries Arriv actually recorded. No search ranking, impression or advertising figures are estimated or implied.",
  ];

  try {
    const sent = await sendBrevoEmail({
      to,
      subject,
      textContent: lines.join("\n"),
      senderEmail: BOOKINGS_SENDER_EMAIL,
      senderName: "Arriv Estate Media",
    });
    return { ok: true, messageId: sent?.messageId || "" };
  } catch (error: any) {
    return { ok: false, error: String(error?.message || error) };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "sweep");
    const now = new Date();

    // This endpoint's URL is public and a workflow calls it as an app admin, so it refuses anyone
    // who is not an authenticated administrator. No shared secret is involved.
    const actor = await resolvePropertyActor(base44, body);
    let platformUser: any = null;
    try {
      platformUser = await base44.auth.me();
    } catch {
      platformUser = null;
    }
    if (!platformUser) {
      return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const platformAdmin = platformUser?.role === 'admin';
    if (!platformAdmin && !actor.isAdmin) {
      return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    // ── Stripe → activation ────────────────────────────────────────────────
    if (action === "payment_succeeded") {
      const promotion = await getPromotion(base44, String(body.promotion_id || ""));
      if (!promotion) return Response.json({ ok: false, error: "PROMOTION_NOT_FOUND" });
      const result = await activatePromotion(base44, promotion.id, {
        paymentIntentId: String(body.payment_intent_id || promotion.stripe_payment_intent_id || ""),
        amountCents: Number(body.amount_cents || 0),
        actor: "stripe",
        source: "webhook",
      });
      return Response.json({
        ok: true,
        duplicate: result.duplicate,
        review: result.review,
        status: result.promotion?.status || "",
      });
    }

    if (action === "payment_failed") {
      const promotion = await getPromotion(base44, String(body.promotion_id || ""));
      if (!promotion) return Response.json({ ok: false, error: "PROMOTION_NOT_FOUND" });
      const result = await markPaymentFailed(base44, promotion.id, {
        paymentIntentId: String(body.payment_intent_id || ""),
        reason: String(body.reason || "payment_failed"),
      });
      return Response.json({ ok: true, changed: result.changed, status: result.promotion?.status || "" });
    }

    if (action !== "sweep") return Response.json({ ok: false, error: "UNKNOWN_ACTION" }, { status: 400 });

    // ── The scheduled pass ─────────────────────────────────────────────────
    const counts = {
      inspected: 0,
      expired: 0,
      paused: 0,
      resumed: 0,
      terminated: 0,
      abandoned_payments: 0,
      captured_reservations: 0,
      expiring_notices: 0,
      unpublish_warnings: 0,
      weekly_reports: 0,
      final_summaries: 0,
      errors: 0,
    };

    // 1. A checkout that was never completed must not sit pending forever.
    const pending = rows(
      await base44.asServiceRole.entities.PropertyPromotion.filter({ status: "pending_payment" }, { limit: 50 }),
    );
    for (const promotion of pending) {
      const created = Date.parse(String(promotion.created_at || promotion.created_date || ""));
      if (!Number.isFinite(created)) continue;
      if (now.getTime() - created > ABANDONED_PAYMENT_HOURS * 3600000) {
        try {
          await markPaymentFailed(base44, promotion.id, { reason: "checkout_abandoned" });
          counts.abandoned_payments++;
        } catch {
          counts.errors++;
        }
      }
    }

    // 1b. A package reserved before approval is charged the moment its page is eligible. A hold
    // that can no longer lead to a placement is released, so nothing is ever charged for it.
    const reserved = rows(
      await base44.asServiceRole.entities.PropertyPromotion.filter({ status: "authorized" }, { limit: 50 }),
    );
    for (const promotion of reserved) {
      try {
        const listing = await loadListing(base44, promotion.listing_id);
        const eligibility = listingEligibility(listing, now);
        if (!eligibility.ok) {
          if (eligibility.terminal) {
            await releasePaymentAuthorization(promotion);
            await endPromotion(base44, promotion, {
              status: "ended",
              reason: eligibility.code.toLowerCase(),
              actor: "system",
              review: true,
            });
          }
          continue;
        }
        const result = await capturePromotionPayment(base44, promotion.id, { actor: "sweep", source: "approval_capture" });
        if (result.activated) counts.captured_reservations++;
      } catch {
        counts.errors++;
      }
    }

    // 2. Every live promotion is reconciled against the listing it promotes.
    const live = rows(
      await base44.asServiceRole.entities.PropertyPromotion.filter(
        { status: { $in: ["active", "paused"] } },
        { sort: "ends_at", limit: 100 },
      ),
    );

    for (const promotion of live) {
      counts.inspected++;
      try {
        const listing = await loadListing(base44, promotion.listing_id);
        const endsAt = Date.parse(String(promotion.ends_at || ""));

        // A promotion that has run its term ends, and its performance is recorded for good.
        if (promotion.status === "active" && Number.isFinite(endsAt) && endsAt <= now.getTime()) {
          const performance = await promotionPerformance(base44, listing || { listing_id: promotion.listing_id }, {
            startIso: String(promotion.activated_at || ""),
            endIso: String(promotion.ends_at || ""),
          });
          await base44.asServiceRole.entities.PropertyPromotion.update(promotion.id, {
            final_summary: performance,
            final_summary_sent_at: now.toISOString(),
            last_report_sent_at: now.toISOString(),
          });
          await sendSummaryEmail(promotion, listing, performance, "final");
          await endPromotion(base44, promotion, {
            status: "expired",
            reason: "term_completed",
            actor: "system",
          });
          counts.expired++;
          counts.final_summaries++;
          continue;
        }

        // Pause / resume / terminate for eligibility.
        const reconciled = await reconcilePromotion(base44, promotion, listing, now);
        if (reconciled.action === "paused") counts.paused++;
        if (reconciled.action === "resumed") counts.resumed++;
        if (reconciled.action === "terminated" || reconciled.action === "ended_for_ineligibility") counts.terminated++;

        const refreshed = reconciled.changed
          ? (await base44.asServiceRole.entities.PropertyPromotion.filter({ promotion_id: promotion.promotion_id }))
          : [promotion];
        const current = rows(refreshed)[0] || promotion;
        if (current.status !== "active") continue;

        // 3. A warning before the page is unpublished, while a paid placement is running.
        if (
          listing?.publication_state === "PUBLISHED" &&
          !promotion.notified_unpublish_warning_at &&
          daysSince(listing.last_status_confirmed_at || listing.published_at) >= STATUS_CONFIRMATION_WINDOW_DAYS &&
          daysSince(listing.last_status_confirmed_at || listing.published_at) < STATUS_AUTO_DEACTIVATE_AFTER_DAYS
        ) {
          const sent = await notify(base44, current, "unpublish_warning", { listing });
          if (sent?.ok) counts.unpublish_warnings++;
        }

        // 4. Three days before the term ends.
        const remaining = Date.parse(String(current.ends_at || "")) - now.getTime();
        if (Number.isFinite(remaining) && remaining <= EXPIRING_WINDOW_MS && remaining > 0 && !current.notified_expiring_at) {
          const sent = await notify(base44, current, "expiring", { listing });
          if (sent?.ok) counts.expiring_notices++;
        }

        // 5. Weekly summaries are a Pro benefit only.
        if (current.package_tier === "pro") {
          const activated = Date.parse(String(current.activated_at || ""));
          const lastSent = Date.parse(String(current.last_report_sent_at || ""));
          const due = Number.isFinite(activated) && now.getTime() - activated >= WEEK_MS
            && (!Number.isFinite(lastSent) || now.getTime() - lastSent >= WEEK_MS);
          if (due) {
            const weekStart = new Date(now.getTime() - WEEK_MS).toISOString();
            const performance = await promotionPerformance(base44, listing || { listing_id: current.listing_id }, {
              startIso: weekStart,
              endIso: now.toISOString(),
            });
            const sent = await sendSummaryEmail(current, listing, performance, "weekly");
            if (sent?.ok) {
              await base44.asServiceRole.entities.PropertyPromotion.update(current.id, { last_report_sent_at: now.toISOString() });
              counts.weekly_reports++;
            }
          }
        }
      } catch (error) {
        counts.errors++;
        console.warn(`promotion sweep failed for ${promotion.promotion_id}:`, String((error as any)?.message || error));
      }
    }

    return Response.json({ ok: true, counts, ran_at: now.toISOString() });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
});