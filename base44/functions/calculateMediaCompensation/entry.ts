import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { calculateMediaCompensation } from "../../shared/mediaCompensationEngine.ts";
import { getActiveCompensationConfig } from "../../shared/mediaConfigLoader.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      commissionable_service_value,
      package_id,
      property_pricing_tier,
      sales_member_id,
    } = body;

    if (package_id == null || property_pricing_tier == null) {
      return Response.json({ error: "package_id and property_pricing_tier are required" }, { status: 400 });
    }

    // Load the active compensation config (from DB or default)
    const config = await getActiveCompensationConfig(base44);

    // Calculate authoritative compensation — server-side
    const result = calculateMediaCompensation(config, {
      commissionable_service_value: commissionable_service_value || 0,
      package_id,
      property_pricing_tier,
      sales_member_id: sales_member_id || "",
    });

    return Response.json({ success: true, compensation: result });
  } catch (error) {
    console.error("calculateMediaCompensation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}