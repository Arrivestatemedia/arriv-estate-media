import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getPropertyDataProvider, determinePricingTier } from "../../shared/propertyDataProvider.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { address, lookup_by } = body;

    if (!address) {
      return Response.json({ error: "address is required" }, { status: 400 });
    }

    // Use the property data provider abstraction (currently null provider → MANUAL_REQUIRED)
    const provider = getPropertyDataProvider();
    const result = provider.lookupProperty(address);

    // Store the lookup result for caching/audit
    try {
      await base44.asServiceRole.entities.PropertyLookup.create({
        input_address: address,
        normalized_address: result.normalized_address,
        property_lat: result.property_lat,
        property_lng: result.property_lng,
        property_sqft: result.property_sqft,
        property_sqft_source: result.property_sqft_source,
        property_sqft_source_record_id: result.property_sqft_source_record_id,
        property_sqft_verified: result.property_sqft_verified,
        property_sqft_verification_method: result.property_sqft_verification_method,
        property_pricing_tier: result.property_pricing_tier,
        lookup_status: result.lookup_status || result.status,
        lookup_error: result.lookup_error,
        lookup_at: new Date().toISOString(),
        lookup_by: lookup_by || "system",
      });
    } catch (e) {
      // PropertyLookup entity might not exist yet — continue anyway
    }

    return Response.json({ success: true, property: result });
  } catch (error) {
    console.error("lookupPropertySqft error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}