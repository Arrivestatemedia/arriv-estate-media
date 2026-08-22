import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { MANIFEST_ENTRY_TYPES } from "../../shared/manifestFallbacks.ts";

const SUPPORTED_MANIFEST_TYPES = MANIFEST_ENTRY_TYPES;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    let applied = 0;
    let rejected = 0;
    let errors = 0;

    for (const manifestType of SUPPORTED_MANIFEST_TYPES) {
      try {
        const result = await base44.functions.invoke("consumeArrivOneProductManifest", { manifest_type: manifestType });
        if (result?.data?.applied) applied++;
        else if (result?.data?.reason?.includes("Checksum")) rejected++;
      } catch (e) {
        errors++;
      }
    }

    return Response.json({
      success: true,
      checked: SUPPORTED_MANIFEST_TYPES.length,
      applied,
      rejected,
      errors,
    });
  } catch (error) {
    console.error("syncArrivOneProductManifestsNow error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}