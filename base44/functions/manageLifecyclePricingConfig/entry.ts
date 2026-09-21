import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { DEFAULT_LIFECYCLE_CONFIG } from "../../shared/customerLifecycleEngine.ts";

// ============================================================================
// manageLifecyclePricingConfig — Admin-only function to view and update the
// customer lifecycle pricing configuration. All changes are effective-dated
// and only affect NEW pricing snapshots. Historical snapshots are immutable.
//
// Actions:
//   "get"    — returns the active config (or default if none set)
//   "update" — deactivates the current active config and creates a new
//              effective-dated version with the provided rules
// ============================================================================

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json();
    const { action } = body;

    if (action === "get") {
      const configs = await base44.asServiceRole.entities.CustomerLifecyclePricingConfig.filter(
        { is_active: true },
        "-effective_date",
        1
      );
      if (configs && configs.length > 0 && configs[0].config_json) {
        return Response.json({
          success: true,
          config: JSON.parse(configs[0].config_json),
          effective_date: configs[0].effective_date,
          config_version: configs[0].config_version,
        });
      }
      return Response.json({
        success: true,
        config: DEFAULT_LIFECYCLE_CONFIG,
        effective_date: null,
        config_version: null,
        is_default: true,
      });
    }

    if (action === "update") {
      const {
        introductory_duration_months,
        first_adjustment_cents,
        recurring_annual_adjustment_cents,
        future_adjustments_enabled,
        effective_date,
      } = body;

      // Validate
      if (
        typeof introductory_duration_months !== "number" ||
        introductory_duration_months < 0
      ) {
        return Response.json({ error: "introductory_duration_months must be a non-negative number" }, { status: 400 });
      }
      if (typeof first_adjustment_cents !== "number" || first_adjustment_cents < 0) {
        return Response.json({ error: "first_adjustment_cents must be a non-negative number" }, { status: 400 });
      }
      if (typeof recurring_annual_adjustment_cents !== "number" || recurring_annual_adjustment_cents < 0) {
        return Response.json({ error: "recurring_annual_adjustment_cents must be a non-negative number" }, { status: 400 });
      }
      if (typeof future_adjustments_enabled !== "boolean") {
        return Response.json({ error: "future_adjustments_enabled must be a boolean" }, { status: 400 });
      }
      if (!effective_date) {
        return Response.json({ error: "effective_date is required (ISO date)" }, { status: 400 });
      }

      const newConfig = {
        config_version: `AEM_LIFECYCLE_PRICING_V${Date.now()}`,
        introductory_duration_months,
        first_adjustment_cents,
        recurring_annual_adjustment_cents,
        future_adjustments_enabled,
        tenure_basis: "first_delivered_paid_service" as const,
      };

      // Deactivate the current active config
      const currentActive = await base44.asServiceRole.entities.CustomerLifecyclePricingConfig.filter(
        { is_active: true },
        "-effective_date",
        1
      );
      if (currentActive && currentActive.length > 0) {
        for (const c of currentActive) {
          await base44.asServiceRole.entities.CustomerLifecyclePricingConfig.update(c.id, { is_active: false });
        }
      }

      // Create the new effective-dated config
      const created = await base44.asServiceRole.entities.CustomerLifecyclePricingConfig.create({
        config_version: newConfig.config_version,
        is_active: true,
        effective_date: effective_date,
        config_json: JSON.stringify(newConfig),
        created_by: user.email,
        created_at: new Date().toISOString(),
      });

      return Response.json({
        success: true,
        config: newConfig,
        effective_date: effective_date,
        config_version: newConfig.config_version,
        record_id: created.id,
        note: "New config is effective immediately for new pricing snapshots. Historical snapshots are immutable and never recalculate.",
      });
    }

    return Response.json({ error: "Unknown action. Use 'get' or 'update'." }, { status: 400 });
  } catch (error) {
    console.error("manageLifecyclePricingConfig error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}