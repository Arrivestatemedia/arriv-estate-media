import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TrendingUp, Loader2, Check, Calendar } from "lucide-react";

// ============================================================================
// CustomerLifecyclePricingControl — Admin settings for the customer-tenure
// price escalation rules. All changes are effective-dated and only affect
// NEW pricing snapshots. Historical snapshots are immutable.
// ============================================================================

export default function CustomerLifecyclePricingControl() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Editable fields
  const [introMonths, setIntroMonths] = useState(12);
  const [firstAdjustment, setFirstAdjustment] = useState(50);
  const [recurringAdjustment, setRecurringAdjustment] = useState(25);
  const [futureEnabled, setFutureEnabled] = useState(true);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    base44.functions.invoke("manageLifecyclePricingConfig", { action: "get" })
      .then(res => {
        const data = res?.data;
        if (data?.success && data.config) {
          setConfig(data.config);
          setIntroMonths(data.config.introductory_duration_months ?? 12);
          setFirstAdjustment((data.config.first_adjustment_cents ?? 5000) / 100);
          setRecurringAdjustment((data.config.recurring_annual_adjustment_cents ?? 2500) / 100);
          setFutureEnabled(data.config.future_adjustments_enabled ?? true);
          if (data.effective_date) setEffectiveDate(data.effective_date);
        }
      })
      .catch(err => setError(err?.message || "Failed to load config"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = () => {
    setSaving(true);
    setError("");
    setSuccess(false);
    base44.functions.invoke("manageLifecyclePricingConfig", {
      action: "update",
      introductory_duration_months: parseInt(introMonths, 10),
      first_adjustment_cents: Math.round(parseFloat(firstAdjustment) * 100),
      recurring_annual_adjustment_cents: Math.round(parseFloat(recurringAdjustment) * 100),
      future_adjustments_enabled: futureEnabled,
      effective_date: effectiveDate,
    })
      .then(res => {
        const data = res?.data;
        if (data?.success) {
          setConfig(data.config);
          setSuccess(true);
          setTimeout(() => setSuccess(false), 4000);
        } else {
          setError(data?.error || "Failed to save");
        }
      })
      .catch(err => setError(err?.message || "Failed to save"))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#B8956A]/20 bg-white p-5 space-y-4">
      <div className="flex items-start gap-3">
        <TrendingUp className="w-5 h-5 text-[#B8956A] shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[#1A1A1A]">Customer Lifecycle Pricing</h3>
          <p className="text-xs text-[#1A1A1A]/60 mt-0.5">
            Tenure-based price escalation for returning customers. Applied to package prices only — add-ons are never adjusted.
            Changes are effective-dated and only affect new bookings; historical pricing snapshots are immutable.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}
      {success && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Configuration saved. New rules are active for new bookings.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="intro-months" className="text-xs text-[#1A1A1A]/70">
            Introductory Period (months)
          </Label>
          <Input
            id="intro-months"
            type="number"
            min="0"
            value={introMonths}
            onChange={(e) => setIntroMonths(e.target.value)}
            className="text-sm"
          />
          <p className="text-[10px] text-[#1A1A1A]/50">Base price for this many months from the customer's first delivered paid service.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="first-adjustment" className="text-xs text-[#1A1A1A]/70">
            First Adjustment ($)
          </Label>
          <Input
            id="first-adjustment"
            type="number"
            min="0"
            step="0.01"
            value={firstAdjustment}
            onChange={(e) => setFirstAdjustment(e.target.value)}
            className="text-sm"
          />
          <p className="text-[10px] text-[#1A1A1A]/50">Applied once after the introductory period ends.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="recurring-adjustment" className="text-xs text-[#1A1A1A]/70">
            Recurring Annual Adjustment ($)
          </Label>
          <Input
            id="recurring-adjustment"
            type="number"
            min="0"
            step="0.01"
            value={recurringAdjustment}
            onChange={(e) => setRecurringAdjustment(e.target.value)}
            className="text-sm"
          />
          <p className="text-[10px] text-[#1A1A1A]/50">Added each additional 12-month period after the first adjustment.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="effective-date" className="text-xs text-[#1A1A1A]/70">
            Effective Date
          </Label>
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#1A1A1A]/40 pointer-events-none" />
            <Input
              id="effective-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="text-sm pl-9"
            />
          </div>
          <p className="text-[10px] text-[#1A1A1A]/50">When this configuration becomes active for new bookings.</p>
        </div>
      </div>

      <div className="flex items-center justify-between py-2 border-t border-[#1A1A1A]/10">
        <div>
          <p className="text-sm font-medium text-[#1A1A1A]">Enable Future Adjustments</p>
          <p className="text-xs text-[#1A1A1A]/60">When off, the price caps at the first adjustment (no recurring annual increases).</p>
        </div>
        <Switch checked={futureEnabled} onCheckedChange={setFutureEnabled} />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#B8956A] hover:bg-[#A68559] text-white"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
          Save Configuration
        </Button>
      </div>

      {config && (
        <div className="text-[10px] text-[#1A1A1A]/50 border-t border-[#1A1A1A]/10 pt-3">
          Current version: {config.config_version || "default"} · Tenure basis: {config.tenure_basis || "first_delivered_paid_service"}
        </div>
      )}
    </div>
  );
}