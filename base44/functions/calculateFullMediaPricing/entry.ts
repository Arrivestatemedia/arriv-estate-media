import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { calculateMediaPricing } from "../../shared/mediaPricingEngine.ts";
import { calculateMediaCompensation } from "../../shared/mediaCompensationEngine.ts";
import { getActivePricingConfig, getActiveCompensationConfig } from "../../shared/mediaConfigLoader.ts";
import { getRequiredCapabilities } from "../../shared/mediaCapabilities.ts";

// ============================================================================
// calculateFullMediaPricing — THE canonical entry point for all booking paths.
//
// This function:
//   1. Calculates authoritative pricing (package + add-ons + Preferred + discounts)
//   2. Checks new-customer MLS bonus eligibility
//   3. Calculates authoritative compensation (sales + provider + Arriv)
//   4. Optionally creates a PricingSnapshot
//   5. Returns the complete financial breakdown
//
// Called by: client booking, sales convert-to-job, admin job creation, booking changes.
// Never trusts frontend-submitted totals — server recalculates everything.
// ============================================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      package_id,
      property_sqft,
      add_on_ids,
      preferred_active,
      approved_discount_amount,
      referral_tender_amount,
      contact_id,
      contact_email,
      sales_member_id,
      payment_timing,
      create_snapshot,
    } = body;

    if (!package_id) {
      return Response.json({ error: "package_id is required" }, { status: 400 });
    }

    // 1. Load configs
    const pricingConfig = await getActivePricingConfig(base44);
    const compensationConfig = await getActiveCompensationConfig(base44);

    // 2. Calculate authoritative pricing
    const pricingResult = calculateMediaPricing(pricingConfig, {
      package_id,
      property_sqft: property_sqft || null,
      add_on_ids: add_on_ids || [],
      preferred_active: preferred_active || false,
      approved_discount_amount: approved_discount_amount || 0,
      referral_tender_amount: referral_tender_amount || 0,
    });

    if (pricingResult.status !== "OK") {
      return Response.json({
        success: true,
        status: pricingResult.status,
        pricing: pricingResult,
        compensation: null,
      });
    }

    // 3. Check new-customer MLS bonus eligibility
    let isNewCustomerMlsQualifying = false;
    if (package_id === "mls_walkthrough" && pricingResult.property_pricing_tier === "TIER_1") {
      try {
        const bonusCheckRes = await base44.functions.invoke("checkNewCustomerMlsBonus", {
          contact_id,
          contact_email,
          package_id,
          property_pricing_tier: pricingResult.property_pricing_tier,
          sales_member_id,
        });
        isNewCustomerMlsQualifying = bonusCheckRes?.data?.eligible || false;
      } catch (e) {
        // If bonus check fails, default to false (standard 15% applies)
      }
    }

    // 4. Calculate authoritative compensation
    const compensationResult = calculateMediaCompensation(compensationConfig, {
      commissionable_service_value: pricingResult.commissionable_service_value,
      package_id,
      property_pricing_tier: pricingResult.property_pricing_tier,
      is_new_customer_mls_qualifying: isNewCustomerMlsQualifying,
      sales_member_id: sales_member_id || "",
    });

    // 5. Get required capabilities for this package + add-ons
    const requiredCapabilities = getRequiredCapabilities(package_id, add_on_ids || []);

    // 6. Build the complete result
    const fullResult = {
      status: "OK",
      pricing: pricingResult,
      compensation: compensationResult,
      required_capabilities: requiredCapabilities,
      is_new_customer_mls_qualifying: isNewCustomerMlsQualifying,
    };

    // 7. Optionally create a PricingSnapshot
    if (create_snapshot) {
      try {
        const snapshotData = {
          pricing_version: pricingResult.pricing_version,
          package_id,
          package_name: body.package_name || package_id,
          property_address: body.property_address || "",
          normalized_address: body.normalized_address || "",
          property_sqft: property_sqft || null,
          property_sqft_source: body.property_sqft_source || "none",
          property_sqft_verified: body.property_sqft_verified || false,
          property_pricing_tier: pricingResult.property_pricing_tier,
          property_adjusted_package_price: pricingResult.property_adjusted_package_price,
          selected_add_ons: pricingResult.selected_add_ons,
          add_ons_subtotal: pricingResult.add_ons_subtotal,
          preferred_active: preferred_active || false,
          preferred_discount: pricingResult.preferred_discount,
          approved_discount_amount: pricingResult.approved_discount_amount,
          approved_discount_id: body.approved_discount_id || "",
          referral_rewards_redeemed: pricingResult.referral_tender_amount,
          commissionable_service_value: pricingResult.commissionable_service_value,
          customer_service_total: pricingResult.customer_service_total,
          payment_amount_due: pricingResult.payment_amount_due,
          payment_timing: payment_timing || "pay_up_front",
          sales_member_id: sales_member_id || "",
          sales_compensation_rule: compensationResult.sales_compensation_rule,
          sales_compensation_amount: compensationResult.sales_commission,
          provider_compensation_rule: compensationResult.provider_compensation_rule,
          provider_compensation_amount: compensationResult.media_partner_payout,
          arriv_contribution_before_processing: compensationResult.arriv_contribution,
          compensation_version: compensationResult.compensation_version,
          calculation_json: JSON.stringify(fullResult),
          created_at: new Date().toISOString(),
        };
        const snapshot = await base44.asServiceRole.entities.PricingSnapshot.create(snapshotData);
        fullResult.pricing_snapshot_id = snapshot.id;
      } catch (e) {
        console.error("PricingSnapshot creation error:", e);
      }
    }

    return Response.json({ success: true, ...fullResult });
  } catch (error) {
    console.error("calculateFullMediaPricing error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}