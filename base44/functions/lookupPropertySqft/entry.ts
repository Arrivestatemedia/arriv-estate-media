import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { determinePricingTier } from "../../shared/propertyDataProvider.ts";

const SQFT_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean", description: "Whether verified living-area square footage was found from a real public source" },
    property_sqft: { type: "integer", description: "Living area square footage (interior), or 0 if not found" },
    normalized_address: { type: "string", description: "Full normalized property address (street, city, state, zip)" },
    source_name: { type: "string", description: "Where the data was found (e.g. 'Zillow', 'Realtor.com', 'Redfin', 'county assessor')" },
    source_url: { type: "string", description: "URL of the listing/record if available, empty string if not" },
    confidence: { type: "string", enum: ["HIGH", "MODERATE", "LOW"], description: "Confidence in the found data" },
    notes: { type: "string", description: "Brief explanation of what was found or why it was not found" }
  },
  required: ["found", "property_sqft", "normalized_address", "source_name", "source_url", "confidence", "notes"]
};

const LOOKUP_PROMPT = `You are a property data lookup assistant for a real-estate media company. Your job is to find the LIVING AREA (interior) square footage of a specific property address by searching public real estate records.

SEARCH STRATEGY:
1. Search Zillow, Realtor.com, Redfin, and county assessor / property appraiser websites for the exact address.
2. Look for the "living area", "interior sqft", "sq ft", or "building area" field from the listing or public record.
3. Prefer the most authoritative source (county assessor > MLS listing > aggregator).

STRICT RULES:
- Return found: true ONLY if you found an actual square footage number from a real public source.
- Return found: false if you could not find the property, the address is invalid, or no sqft data is available.
- NEVER estimate, guess, or approximate square footage. Only return numbers you actually saw on a real listing or record.
- Do NOT return lot size — only LIVING AREA / INTERIOR square footage.
- If multiple sources disagree, return the most commonly cited value and set confidence to MODERATE.

ADDRESS TO LOOK UP: "{ADDRESS}"

Search the web now and return the structured result.`;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { address, lookup_by } = body;

    if (!address) {
      return Response.json({ error: "address is required" }, { status: 400 });
    }

    const prompt = LOOKUP_PROMPT.replace("{ADDRESS}", address);

    const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: "gemini_3_flash",
      response_json_schema: SQFT_SCHEMA,
    });

    const lookup = typeof llmResult === "string" ? JSON.parse(llmResult) : llmResult;

    const found = lookup?.found === true && Number(lookup?.property_sqft) > 0;
    const sqft = found ? Number(lookup.property_sqft) : null;

    const result = {
      status: found ? "VERIFIED" : "MANUAL_REQUIRED",
      normalized_address: lookup?.normalized_address || address,
      property_lat: null,
      property_lng: null,
      property_sqft: sqft,
      property_sqft_source: found ? (lookup.source_name || "web_search") : "none",
      property_sqft_source_record_id: lookup?.source_url || "",
      property_sqft_verified: found,
      property_sqft_verification_method: found ? "provider_api" : null,
      property_pricing_tier: found ? determinePricingTier(sqft) : "UNKNOWN",
      lookup_error: found ? null : (lookup?.notes || "Could not find verified square footage for this address"),
    };

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
        lookup_status: result.status,
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