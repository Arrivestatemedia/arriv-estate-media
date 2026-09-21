import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

/**
 * Admin-only org-wide toggle that controls whether the Pay-at-Closing
 * option is shown to clients on the BookingPage. The backend logic is
 * untouched; this only gates the client-facing UI. Default is OFF.
 *
 * Props:
 *   enabled  — current setting value (boolean)
 *   onToggle — callback(newEnabled: boolean) to update parent state
 */
export default function PayAtClosingSettingToggle({ enabled, onToggle }) {
  const [saving, setSaving] = useState(false);
  const SETTING_KEY = "pay_at_closing_enabled";

  const handleChange = async (checked) => {
    setSaving(true);
    try {
      const existing = await base44.entities.AppSetting.filter({ key: SETTING_KEY });
      if (existing && existing.length > 0) {
        await base44.entities.AppSetting.update(existing[0].id, { value: String(checked) });
      } else {
        await base44.entities.AppSetting.create({ key: SETTING_KEY, value: String(checked) });
      }
      onToggle(checked);
      toast.success(checked ? "Pay-at-closing enabled for clients" : "Pay-at-closing hidden from clients");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update setting");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Switch checked={enabled} onCheckedChange={handleChange} disabled={saving} />
      <span className="text-xs whitespace-nowrap" style={{ color: 'rgba(26,26,26,0.7)' }}>
        {saving ? 'Saving…' : 'Offer Pay-at-Closing'}
      </span>
    </div>
  );
}