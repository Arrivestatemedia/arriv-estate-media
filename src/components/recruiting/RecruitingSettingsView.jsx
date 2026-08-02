import React, { useState, useEffect } from "react";
import { getSettings, updateSettings } from "@/lib/recruitingApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

export default function RecruitingSettingsView() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then((d) => { setSettings(d.settings); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { recruiting_enabled, max_search_results, outreach_approval_required, opt_out_language, default_radius_miles, search_frequency_days, max_prospects_per_cycle } = settings;
      await updateSettings({ recruiting_enabled, max_search_results, outreach_approval_required, opt_out_language, default_radius_miles, search_frequency_days, max_prospects_per_cycle });
      alert("Settings saved.");
    } catch (e) { alert("Failed to save: " + e.message); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;
  if (!settings) return <p style={{ color: MUTED }}>Unable to load settings.</p>;

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>Recruiting Settings</h2>

      <div className="p-5 rounded-xl space-y-4" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
        <label className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium" style={{ color: TEXT_DARK }}>Recruiting Module Enabled</span>
            <p className="text-xs" style={{ color: MUTED }}>Master toggle for the entire recruiting system</p>
          </div>
          <input type="checkbox" checked={settings.recruiting_enabled} onChange={(e) => setSettings({ ...settings, recruiting_enabled: e.target.checked })} className="w-5 h-5" />
        </label>

        <div>
          <Label className="block text-sm font-medium mb-1" style={{ color: TEXT_DARK }}>Max Search Results</Label>
          <Input type="number" min="1" max="50" value={settings.max_search_results} onChange={(e) => setSettings({ ...settings, max_search_results: parseInt(e.target.value) || 10 })} className="bg-white" />
          <p className="text-xs mt-1" style={{ color: MUTED }}>Maximum prospects returned per search</p>
        </div>

        <div>
          <Label className="block text-sm font-medium mb-1" style={{ color: TEXT_DARK }}>Default Radius (miles)</Label>
          <Input type="number" min="5" max="100" value={settings.default_radius_miles} onChange={(e) => setSettings({ ...settings, default_radius_miles: parseInt(e.target.value) || 25 })} className="bg-white" />
        </div>

        <label className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium" style={{ color: TEXT_DARK }}>Outreach Approval Required</span>
            <p className="text-xs" style={{ color: MUTED }}>Require admin approval before sending outreach</p>
          </div>
          <input type="checkbox" checked={settings.outreach_approval_required} onChange={(e) => setSettings({ ...settings, outreach_approval_required: e.target.checked })} className="w-5 h-5" />
        </label>

        <div>
          <Label className="block text-sm font-medium mb-1" style={{ color: TEXT_DARK }}>Opt-Out Language</Label>
          <textarea value={settings.opt_out_language || ""} onChange={(e) => setSettings({ ...settings, opt_out_language: e.target.value })} rows={2}
            className="w-full p-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#B8956A] bg-white" style={{ borderColor: "rgba(184,149,106,0.2)", color: TEXT_DARK }} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="block text-sm font-medium mb-1" style={{ color: TEXT_DARK }}>Search Frequency (days)</Label>
            <Input type="number" value={settings.search_frequency_days} onChange={(e) => setSettings({ ...settings, search_frequency_days: parseInt(e.target.value) || 7 })} className="bg-white" />
          </div>
          <div>
            <Label className="block text-sm font-medium mb-1" style={{ color: TEXT_DARK }}>Max Prospects Per Cycle</Label>
            <Input type="number" value={settings.max_prospects_per_cycle} onChange={(e) => setSettings({ ...settings, max_prospects_per_cycle: parseInt(e.target.value) || 15 })} className="bg-white" />
          </div>
        </div>

        <div className="pt-4 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
          <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}