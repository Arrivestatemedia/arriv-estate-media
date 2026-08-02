import React, { useState, useEffect } from "react";
import { Settings as SettingsIcon, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSettings, updateSettings } from "@/lib/recruitingApi";
import { toast } from "sonner";

export default function RecruitingSettingsView() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((res) => setSettings(res.settings))
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateSettings(settings);
      setSettings(res.settings);
      toast.success("Settings saved");
    } catch (e) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#FFFBF5]">
        <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full text-[#1A1A1A]/50 bg-[#FFFBF5]">
        Failed to load settings
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#FFFBF5] p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Recruiting Settings</h1>
          <p className="text-sm text-[#1A1A1A]/60 mt-1">Configure your talent sourcing preferences</p>
        </div>

        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5 space-y-5">
          {/* Recruiting enabled */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-[#1A1A1A]">Recruiting Enabled</Label>
              <p className="text-xs text-[#1A1A1A]/50 mt-0.5">Master toggle for the recruiting module</p>
            </div>
            <label className="cursor-pointer">
              <input
                type="checkbox"
                checked={settings.recruiting_enabled}
                onChange={(e) => setSettings({ ...settings, recruiting_enabled: e.target.checked })}
                className="w-5 h-5 accent-[#B8956A]"
              />
            </label>
          </div>

          <div className="border-t border-[#B8956A]/10 pt-5">
            <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">Max Search Results</Label>
            <Input
              type="number"
              value={settings.max_search_results}
              onChange={(e) => setSettings({ ...settings, max_search_results: parseInt(e.target.value) || 25 })}
            />
            <p className="text-xs text-[#1A1A1A]/50 mt-1">Maximum prospects returned per search (5-50 recommended)</p>
          </div>

          <div className="border-t border-[#B8956A]/10 pt-5">
            <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">Default Search Radius (miles)</Label>
            <Input
              type="number"
              value={settings.default_search_radius}
              onChange={(e) => setSettings({ ...settings, default_search_radius: parseInt(e.target.value) || 50 })}
            />
          </div>

          <div className="border-t border-[#B8956A]/10 pt-5 flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-[#1A1A1A]">Outreach Approval Required</Label>
              <p className="text-xs text-[#1A1A1A]/50 mt-0.5">Require admin approval before sending outreach messages</p>
            </div>
            <label className="cursor-pointer">
              <input
                type="checkbox"
                checked={settings.outreach_approval_required}
                onChange={(e) => setSettings({ ...settings, outreach_approval_required: e.target.checked })}
                className="w-5 h-5 accent-[#B8956A]"
              />
            </label>
          </div>

          <div className="border-t border-[#B8956A]/10 pt-5">
            <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">Opt-Out Language</Label>
            <Textarea
              value={settings.opt_out_language || ""}
              onChange={(e) => setSettings({ ...settings, opt_out_language: e.target.value })}
              placeholder="If you'd prefer not to receive these messages, reply STOP at any time."
              className="bg-[#FFFBF5]"
            />
            <p className="text-xs text-[#1A1A1A]/50 mt-1">Appended to all generated outreach messages</p>
          </div>

          <div className="border-t border-[#B8956A]/10 pt-5 flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-[#1A1A1A]">Continuous Recruiting</Label>
              <p className="text-xs text-[#1A1A1A]/50 mt-0.5">Enable daily auto-sourcing for active pipelines</p>
            </div>
            <label className="cursor-pointer">
              <input
                type="checkbox"
                checked={settings.continuous_recruiting_enabled}
                onChange={(e) => setSettings({ ...settings, continuous_recruiting_enabled: e.target.checked })}
                className="w-5 h-5 accent-[#B8956A]"
              />
            </label>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
          <Save className="w-4 h-4 mr-1.5" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}