// ============================================================================
// MEDIA CONFIG LOADER — Loads the active pricing/compensation config from
// the database, or falls back to the built-in defaults if no config record
// exists yet. This ensures the system works immediately after migration
// without requiring manual config seeding.
// ============================================================================

import { DEFAULT_PRICING_CONFIG } from "./mediaPricingEngine.ts";
import { DEFAULT_COMPENSATION_CONFIG } from "./mediaCompensationEngine.ts";

/**
 * Load the active MediaPricingConfig from the database, or return the default.
 *
 * Two silent-failure modes are normalized here, both of which returned the built-in
 * DEFAULT_PRICING_CONFIG (V1, $100) instead of the active record:
 *
 *   1. CLIENT SHAPE — the query runs through `client.asServiceRole`, so a caller that
 *      passes the service-role client instead of the request client throws and falls
 *      back to the default.
 *   2. RESULT SHAPE — the entity filter returns a plain array for the positional form
 *      and a page (`{ items }`) for the options form. Reading only `.length` treats a
 *      page as empty and falls back to the default.
 *
 * Both are invisible while the default happens to equal the live price — which is
 * exactly how the live MLS price stayed at $100 after V2 was activated. Every
 * server-side pricing surface reads through here, so the fallback is not silent.
 */
export async function getActivePricingConfig(base44): Promise<any> {
  try {
    const svc = base44?.asServiceRole ?? base44;
    const res = await svc.entities.MediaPricingConfig.filter(
      { is_active: true },
      "-effective_date",
      5
    );
    const configs = Array.isArray(res) ? res : (res?.items || res?.data || []);
    if (configs.length > 0 && configs[0].config_json) {
      return JSON.parse(configs[0].config_json);
    }
  } catch (e) {
    // Table might not exist yet or no records — fall back to default
  }
  return DEFAULT_PRICING_CONFIG;
}

/** Load the active MediaCompensationConfig from the database, or return the default. */
export async function getActiveCompensationConfig(base44): Promise<any> {
  try {
    const configs = await base44.asServiceRole.entities.MediaCompensationConfig.filter(
      { is_active: true },
      "-effective_date",
      1
    );
    if (configs && configs.length > 0 && configs[0].config_json) {
      return JSON.parse(configs[0].config_json);
    }
  } catch (e) {
    // Table might not exist yet or no records — fall back to default
  }
  return DEFAULT_COMPENSATION_CONFIG;
}