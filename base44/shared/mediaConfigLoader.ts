// ============================================================================
// MEDIA CONFIG LOADER — Loads the active pricing/compensation config from
// the database, or falls back to the built-in defaults if no config record
// exists yet. This ensures the system works immediately after migration
// without requiring manual config seeding.
// ============================================================================

import { DEFAULT_PRICING_CONFIG } from "./mediaPricingEngine.ts";
import { DEFAULT_COMPENSATION_CONFIG } from "./mediaCompensationEngine.ts";

/** Load the active MediaPricingConfig from the database, or return the default. */
export async function getActivePricingConfig(base44): Promise<any> {
  try {
    const configs = await base44.asServiceRole.entities.MediaPricingConfig.filter(
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