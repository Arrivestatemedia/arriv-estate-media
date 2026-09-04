import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

/**
 * Admin-only org-wide toggle that controls whether non-admin sales reps
 * can reassign contacts via the ContactOwnerDropdown. Admins always have
 * the feature regardless of this setting.
 *
 * Props:
 *   enabled        — current setting value (boolean)
 *   onToggle       — callback(newEnabled: boolean) to update parent state
 */
export default function ContactReassignmentSettingToggle({ enabled, onToggle }) {
  const [saving, setSaving] = useState(false);
  const SETTING_KEY = "non_admin_contact_reassignment";

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
      toast.success(checked ? "Reassignment enabled for reps" : "Reassignment disabled for reps");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update setting");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-3 p-2.5 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.25)' }}>
      <Switch checked={enabled} onCheckedChange={handleChange} disabled={saving} />
      <span className="text-xs" style={{ color: 'rgba(26,26,26,0.7)' }}>
        Allow non-admin reps to reassign contacts
      </span>
    </div>
  );
}