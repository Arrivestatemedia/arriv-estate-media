import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { calculateMediaPricing } from "../../shared/mediaPricingEngine.ts";
import { getActivePricingConfig } from "../../shared/mediaConfigLoader.ts";

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
    } = body;

    if (!package_id) {
      return Response.json({ error: "package_id is required" }, { status: 400 });
    }

    // Load the active pricing config (from DB or default)
    const config = await getActivePricingConfig(base44);

    // Calculate authoritative pricing — server-side, never trusts frontend totals
    const result = calculateMediaPricing(config, {
      package_id,
      property_sqft: property_sqft || null,
      add_on_ids: add_on_ids || [],
      preferred_active: preferred_active || false,
      approved_discount_amount: approved_discount_amount || 0,
      referral_tender_amount: referral_tender_amount || 0,
    });

    return Response.json({ success: true, pricing: result });
  } catch (error) {
    console.error("calculateMediaPricing error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}