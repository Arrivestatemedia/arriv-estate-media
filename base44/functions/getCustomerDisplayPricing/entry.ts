import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getActivePricingConfig } from "../../shared/mediaConfigLoader.ts";
import { getActiveLifecycleConfig, resolveTenureStart, computeTenureBand } from "../../shared/customerLifecycleEngine.ts";
import { determinePricingTier } from "../../shared/propertyDataProvider.ts";
import { centsToDollars } from "../../shared/moneyUtils.ts";

// ============================================================================
// getCustomerDisplayPricing — Returns tenure-adjusted package prices for the
// logged-in customer so the BookingPage shows the already-adjusted price
// everywhere package pricing is displayed, before booking.
//
// The customer sees their lifecycle-adjusted prices transparently — never a
// surprise surcharge at checkout. Add-ons are returned at canonical price
// (lifecycle adjustment never applies to add-ons).
// ============================================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { property_sqft } = body;

    // Identify the customer. Clients log in via custom auth (localStorage),
    // so we accept client_email in the payload. Fall back to platform user email.
    let clientEmail = body.client_email || "";
    if (!clientEmail) {
      try {
        const user = await base44.auth.me();
        if (user?.email) clientEmail = user.email;
      } catch (e) { /* not logged in via platform */ }
    }

    // Load configs
    const pricingConfig = await getActivePricingConfig(base44);
    const lifecycleConfig = await getActiveLifecycleConfig(base44);

    // Resolve tenure (establishes immutable profile if not yet set)
    const tenureResolution = clientEmail
      ? await resolveTenureStart(base44, clientEmail)
      : { tenure_start_date: null, tenure_basis_job_id: "", review_flag: true, review_reason: "No customer email" };

    const now = new Date().toISOString();
    const tenureBand = computeTenureBand(tenureResolution.tenure_start_date, now, lifecycleConfig);

    // Determine the property tier (default TIER_1 when no sqft yet)
    const tier = property_sqft ? determinePricingTier(property_sqft) : "TIER_1";

    // Build adjusted package prices for the resolved tier
    const tierConfig = pricingConfig.tier_prices.find((t) => t.tier === tier);
    const packageIds = ["mls_walkthrough", "photo_essentials", "photo_cinematic", "premium_bundle"];

    const adjustedPackages = {};
    const basePackages = {};
    for (const pkgId of packageIds) {
      const basePriceDollars = tierConfig ? (tierConfig.prices[pkgId] || 0) : 0;
      const basePriceCents = Math.round(basePriceDollars * 100);
      const adjustedPriceCents = basePriceCents + tenureBand.adjustment_cents;
      basePackages[pkgId] = basePriceCents;
      adjustedPackages[pkgId] = adjustedPriceCents;
    }

    // Add-ons at canonical price (no lifecycle adjustment)
    const addOnPrices = {};
    for (const addOn of pricingConfig.add_ons) {
      if (addOn.active) {
        addOnPrices[addOn.id] = Math.round(addOn.customer_price * 100);
      }
    }

    return Response.json({
      success: true,
      client_email: clientEmail,
      property_pricing_tier: tier,
      customer_tenure: {
        start_date: tenureResolution.tenure_start_date,
        band: tenureBand.band,
        band_label: tenureBand.band_label,
        months_of_tenure: tenureBand.months_of_tenure,
        adjustment_cents: tenureBand.adjustment_cents,
        adjustment_dollars: centsToDollars(tenureBand.adjustment_cents),
        review_flag: tenureResolution.review_flag,
        review_reason: tenureResolution.review_reason,
      },
      lifecycle_config: {
        config_version: lifecycleConfig.config_version,
        introductory_duration_months: lifecycleConfig.introductory_duration_months,
        first_adjustment_cents: lifecycleConfig.first_adjustment_cents,
        recurring_annual_adjustment_cents: lifecycleConfig.recurring_annual_adjustment_cents,
        future_adjustments_enabled: lifecycleConfig.future_adjustments_enabled,
      },
      base_package_prices: basePackages,       // canonical (cents)
      adjusted_package_prices: adjustedPackages, // lifecycle-adjusted (cents)
      add_on_prices: addOnPrices,               // canonical (cents, no lifecycle)
    });
  } catch (error) {
    console.error("getCustomerDisplayPricing error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}