import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  DEFAULT_B2B_PLAN_CONFIG,
  DEFAULT_B2B_CAPACITY_CONFIG,
  DEFAULT_B2B_CREDIT_CONFIG,
  DEFAULT_B2B_SEAT_CONFIG,
  DEFAULT_B2B_IMPLEMENTATION_CONFIG,
  DEFAULT_B2B_COMMISSION_CONFIG,
  DEFAULT_B2B_SQFT_SURCHARGE_CONFIG,
  B2B_PLAN_CONFIG_VERSION,
  B2B_CAPACITY_CONFIG_VERSION,
  B2B_CREDIT_CONFIG_VERSION,
  B2B_SEAT_CONFIG_VERSION,
  B2B_IMPLEMENTATION_CONFIG_VERSION,
  B2B_COMMISSION_CONFIG_VERSION,
  B2B_SQFT_SURCHARGE_CONFIG_VERSION,
} from "../../shared/b2bConfigDefaults.ts";

// ============================================================================
// seedB2BCanonicalConfig — Creates the initial active B2B configuration records
// and their immutable version snapshots. Idempotent: if a config already
// exists for a given config_version, it is not re-created.
//
// Admin-only. Creates versioned config + immutable version records for:
//   B2BPlanConfig / B2BPlanVersion
//   B2BReservedCapacityConfig
//   B2BMediaCreditConfig
//   B2BSeatConfig
//   B2BImplementationConfig
//   B2BCommissionPlan / B2BCommissionPlanVersion
//   B2BSqftSurchargeConfig
// ============================================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const actor = user.email || "system";
    const results = [];

    // Helper: create a config + version pair idempotently
    async function seedConfigPair(configEntityName, versionEntityName, configVersion, configJson, versionIdField) {
      const existing = await base44.asServiceRole.entities[configEntityName].filter({
        config_version: configVersion,
        is_active: true,
      });
      if (existing && existing.length > 0) {
        results.push({ entity: configEntityName, status: "already_exists", id: existing[0].id });
        return existing[0];
      }

      // Create the immutable version record
      const versionRecord = await base44.asServiceRole.entities[versionEntityName].create({
        [versionIdField]: configVersion,
        version_number: 1,
        config_json: JSON.stringify(configJson),
        effective_at: now,
        expires_at: null,
        status: "active",
        immutable_snapshot: true,
        created_at: now,
        created_by: actor,
        activated_at: now,
        activated_by: actor,
        change_reason: "Initial canonical seed",
      });

      // Create the active config record pointing to the version
      const configRecord = await base44.asServiceRole.entities[configEntityName].create({
        config_version: configVersion,
        is_active: true,
        effective_date: today,
        expires_at: null,
        config_json: JSON.stringify(configJson),
        current_version_id: versionRecord.id,
        activated_at: now,
        activated_by: actor,
        change_reason: "Initial canonical seed",
      });

      results.push({ entity: configEntityName, status: "created", id: configRecord.id, version_id: versionRecord.id });
      return configRecord;
    }

    // 1. Plan Config + Version
    await seedConfigPair(
      "B2BPlanConfig", "B2BPlanVersion",
      B2B_PLAN_CONFIG_VERSION, DEFAULT_B2B_PLAN_CONFIG,
      "plan_config_version"
    );

    // 2. Reserved Capacity Config (no separate version entity in Phase 2 — config_json holds version)
    {
      const existing = await base44.asServiceRole.entities.B2BReservedCapacityConfig.filter({
        config_version: B2B_CAPACITY_CONFIG_VERSION,
        is_active: true,
      });
      if (existing && existing.length > 0) {
        results.push({ entity: "B2BReservedCapacityConfig", status: "already_exists", id: existing[0].id });
      } else {
        const rec = await base44.asServiceRole.entities.B2BReservedCapacityConfig.create({
          config_version: B2B_CAPACITY_CONFIG_VERSION,
          is_active: true,
          effective_date: today,
          expires_at: null,
          config_json: JSON.stringify(DEFAULT_B2B_CAPACITY_CONFIG),
          activated_at: now,
          activated_by: actor,
          change_reason: "Initial canonical seed",
        });
        results.push({ entity: "B2BReservedCapacityConfig", status: "created", id: rec.id });
      }
    }

    // 3. Media Credit Config
    {
      const existing = await base44.asServiceRole.entities.B2BMediaCreditConfig.filter({
        config_version: B2B_CREDIT_CONFIG_VERSION,
        is_active: true,
      });
      if (existing && existing.length > 0) {
        results.push({ entity: "B2BMediaCreditConfig", status: "already_exists", id: existing[0].id });
      } else {
        const rec = await base44.asServiceRole.entities.B2BMediaCreditConfig.create({
          config_version: B2B_CREDIT_CONFIG_VERSION,
          is_active: true,
          effective_date: today,
          expires_at: null,
          config_json: JSON.stringify(DEFAULT_B2B_CREDIT_CONFIG),
          activated_at: now,
          activated_by: actor,
          change_reason: "Initial canonical seed",
        });
        results.push({ entity: "B2BMediaCreditConfig", status: "created", id: rec.id });
      }
    }

    // 4. Seat Config
    {
      const existing = await base44.asServiceRole.entities.B2BSeatConfig.filter({
        config_version: B2B_SEAT_CONFIG_VERSION,
        is_active: true,
      });
      if (existing && existing.length > 0) {
        results.push({ entity: "B2BSeatConfig", status: "already_exists", id: existing[0].id });
      } else {
        const rec = await base44.asServiceRole.entities.B2BSeatConfig.create({
          config_version: B2B_SEAT_CONFIG_VERSION,
          is_active: true,
          effective_date: today,
          expires_at: null,
          config_json: JSON.stringify(DEFAULT_B2B_SEAT_CONFIG),
          activated_at: now,
          activated_by: actor,
          change_reason: "Initial canonical seed",
        });
        results.push({ entity: "B2BSeatConfig", status: "created", id: rec.id });
      }
    }

    // 5. Implementation Config
    {
      const existing = await base44.asServiceRole.entities.B2BImplementationConfig.filter({
        config_version: B2B_IMPLEMENTATION_CONFIG_VERSION,
        is_active: true,
      });
      if (existing && existing.length > 0) {
        results.push({ entity: "B2BImplementationConfig", status: "already_exists", id: existing[0].id });
      } else {
        const rec = await base44.asServiceRole.entities.B2BImplementationConfig.create({
          config_version: B2B_IMPLEMENTATION_CONFIG_VERSION,
          is_active: true,
          effective_date: today,
          expires_at: null,
          config_json: JSON.stringify(DEFAULT_B2B_IMPLEMENTATION_CONFIG),
          activated_at: now,
          activated_by: actor,
          change_reason: "Initial canonical seed",
        });
        results.push({ entity: "B2BImplementationConfig", status: "created", id: rec.id });
      }
    }

    // 6. Commission Plan + Version
    await seedConfigPair(
      "B2BCommissionPlan", "B2BCommissionPlanVersion",
      B2B_COMMISSION_CONFIG_VERSION, DEFAULT_B2B_COMMISSION_CONFIG,
      "commission_config_version"
    );

    // 7. Sqft Surcharge Config
    {
      const existing = await base44.asServiceRole.entities.B2BSqftSurchargeConfig.filter({
        config_version: B2B_SQFT_SURCHARGE_CONFIG_VERSION,
        is_active: true,
      });
      if (existing && existing.length > 0) {
        results.push({ entity: "B2BSqftSurchargeConfig", status: "already_exists", id: existing[0].id });
      } else {
        const rec = await base44.asServiceRole.entities.B2BSqftSurchargeConfig.create({
          config_version: B2B_SQFT_SURCHARGE_CONFIG_VERSION,
          is_active: true,
          effective_date: today,
          expires_at: null,
          config_json: JSON.stringify(DEFAULT_B2B_SQFT_SURCHARGE_CONFIG),
          activated_at: now,
          activated_by: actor,
          change_reason: "Initial canonical seed",
        });
        results.push({ entity: "B2BSqftSurchargeConfig", status: "created", id: rec.id });
      }
    }

    return Response.json({
      success: true,
      message: "B2B canonical configuration seeded",
      results,
    });
  } catch (error) {
    console.error("seedB2BCanonicalConfig error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}