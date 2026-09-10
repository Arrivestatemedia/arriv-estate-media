import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Globe, X, Plus, Trash2, Loader2, Check, ExternalLink } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const modalStyle = {
  backgroundColor: "#FFFFFF",
  borderRadius: "12px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};

const inputStyle = {
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "8px",
  padding: "9px 12px",
  fontSize: "14px",
  color: TEXT_DARK,
  width: "100%",
  outline: "none",
};

const labelStyle = {
  fontSize: "13px",
  fontWeight: 600,
  color: "rgba(26,26,26,0.7)",
  marginBottom: "5px",
  display: "block",
};

export default function CareersHubSettings({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    career_page_enabled: false,
    career_company_slug: "",
    career_company_description: "",
    career_hero_image: "",
    career_culture_text: "",
    career_benefits: [],
    career_locations: [],
    career_social_links: { linkedin: "", facebook: "", x: "", instagram: "", website: "" },
    career_contact_email: "",
    custom_domain: "",
    company_name: "Arriv Estate Media",
    logo_url: "",
    primary_color: "#B8956A",
  });
  const [newBenefit, setNewBenefit] = useState("");
  const [newLocation, setNewLocation] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("manageCareersHubSettings", { action: "get" });
        const data = res?.data ?? res;
        if (data?.settings) {
          setSettings(prev => ({
            ...prev,
            ...data.settings,
            career_social_links: { ...prev.career_social_links, ...(data.settings.career_social_links || {}) },
            career_benefits: data.settings.career_benefits || [],
            career_locations: data.settings.career_locations || [],
          }));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke("manageCareersHubSettings", { action: "save", settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert("Failed to save: " + (err.message || "unknown error"));
    }
    setSaving(false);
  };

  const addBenefit = () => {
    if (newBenefit.trim()) {
      setSettings({ ...settings, career_benefits: [...settings.career_benefits, newBenefit.trim()] });
      setNewBenefit("");
    }
  };
  const removeBenefit = (i) => {
    setSettings({ ...settings, career_benefits: settings.career_benefits.filter((_, idx) => idx !== i) });
  };

  const addLocation = () => {
    if (newLocation.trim()) {
      setSettings({ ...settings, career_locations: [...settings.career_locations, newLocation.trim()] });
      setNewLocation("");
    }
  };
  const removeLocation = (i) => {
    setSettings({ ...settings, career_locations: settings.career_locations.filter((_, idx) => idx !== i) });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" style={{ backdropFilter: "blur(6px)" }}>
        <div className="p-12" style={modalStyle}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
        </div>
      </div>
    );
  }

  const hubUrl = `${window.location.origin}/careers/company/${settings.career_company_slug || "arriv-estate-media"}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" style={{ backdropFilter: "blur(6px)" }} onClick={e => { e.stopPropagation(); if (!saving) onClose?.(); }}>
      <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10" style={{ borderBottom: "1px solid rgba(184,149,106,0.15)", backgroundColor: "#FFFFFF" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>
              <Globe className="w-4 h-4" style={{ color: GOLD }} />
            </div>
            <h2 className="text-lg font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Careers Hub Settings</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X className="w-5 h-5" style={{ color: MUTED }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.04)", border: "1px solid rgba(184,149,106,0.15)" }}>
            <div>
              <p className="font-semibold text-sm" style={{ color: TEXT_DARK }}>Enable Public Careers Page</p>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>When enabled, your careers hub is live and accessible to the public.</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, career_page_enabled: !settings.career_page_enabled })}
              className="relative w-11 h-6 rounded-full transition-colors"
              style={{ backgroundColor: settings.career_page_enabled ? GOLD : "rgba(26,26,26,0.2)" }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                style={{ transform: settings.career_page_enabled ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>

          {/* URL Slug */}
          <div>
            <label style={labelStyle}>Careers Page URL Slug</label>
            <input
              value={settings.career_company_slug}
              onChange={e => setSettings({ ...settings, career_company_slug: e.target.value })}
              placeholder="e.g. arriv-estate-media"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = GOLD}
              onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
            />
            {settings.career_page_enabled && settings.career_company_slug && (
              <a href={hubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs mt-1.5 hover:underline" style={{ color: GOLD }}>
                <ExternalLink className="w-3 h-3" /> Preview live page
              </a>
            )}
          </div>

          {/* Custom Domain */}
          <div>
            <label style={labelStyle}>Custom Domain</label>
            <input
              value={settings.custom_domain || ""}
              onChange={e => setSettings({ ...settings, custom_domain: e.target.value })}
              placeholder="e.g. careers.yourcompany.com"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = GOLD}
              onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
            />
            <p className="text-xs mt-1.5" style={{ color: MUTED }}>Connect a custom domain to host your careers hub on your own URL.</p>
          </div>

          {/* Company Description */}
          <div>
            <label style={labelStyle}>Company Description</label>
            <textarea
              value={settings.career_company_description}
              onChange={e => setSettings({ ...settings, career_company_description: e.target.value })}
              placeholder="Tell candidates about your company..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              onFocus={e => e.target.style.borderColor = GOLD}
              onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
            />
          </div>

          {/* Hero Image */}
          <div>
            <label style={labelStyle}>Hero Image URL</label>
            <input
              value={settings.career_hero_image}
              onChange={e => setSettings({ ...settings, career_hero_image: e.target.value })}
              placeholder="https://..."
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = GOLD}
              onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
            />
          </div>

          {/* Workplace Culture */}
          <div>
            <label style={labelStyle}>Workplace Culture</label>
            <textarea
              value={settings.career_culture_text}
              onChange={e => setSettings({ ...settings, career_culture_text: e.target.value })}
              placeholder="Describe what it's like to work at your company..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              onFocus={e => e.target.style.borderColor = GOLD}
              onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
            />
          </div>

          {/* Benefits */}
          <div>
            <label style={labelStyle}>Benefits & Perks</label>
            <div className="flex gap-2">
              <input
                value={newBenefit}
                onChange={e => setNewBenefit(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addBenefit(); } }}
                placeholder="e.g. Health Insurance"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
              />
              <button onClick={addBenefit} className="px-3 rounded-lg text-sm font-medium whitespace-nowrap" style={{ backgroundColor: "rgba(184,149,106,0.12)", color: GOLD_DARK, border: "1px solid rgba(184,149,106,0.2)" }}>
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            {settings.career_benefits.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {settings.career_benefits.map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm" style={{ backgroundColor: "rgba(184,149,106,0.08)", color: TEXT_DARK }}>
                    {b}
                    <button onClick={() => removeBenefit(i)} className="hover:opacity-60"><Trash2 className="w-3 h-3" style={{ color: MUTED }} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Office Locations */}
          <div>
            <label style={labelStyle}>Office Locations</label>
            <div className="flex gap-2">
              <input
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLocation(); } }}
                placeholder="e.g. Austin, TX"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
              />
              <button onClick={addLocation} className="px-3 rounded-lg text-sm font-medium whitespace-nowrap" style={{ backgroundColor: "rgba(184,149,106,0.12)", color: GOLD_DARK, border: "1px solid rgba(184,149,106,0.2)" }}>
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            {settings.career_locations.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {settings.career_locations.map((l, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm" style={{ backgroundColor: "rgba(184,149,106,0.08)", color: TEXT_DARK }}>
                    {l}
                    <button onClick={() => removeLocation(i)} className="hover:opacity-60"><Trash2 className="w-3 h-3" style={{ color: MUTED }} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Social Links */}
          <div>
            <label style={labelStyle}>Social Links</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ ...labelStyle, fontSize: "12px", marginBottom: "4px" }}>LinkedIn</label>
                <input value={settings.career_social_links?.linkedin || ""} onChange={e => setSettings({ ...settings, career_social_links: { ...settings.career_social_links, linkedin: e.target.value } })} placeholder="https://linkedin.com/..." style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: "12px", marginBottom: "4px" }}>Facebook</label>
                <input value={settings.career_social_links?.facebook || ""} onChange={e => setSettings({ ...settings, career_social_links: { ...settings.career_social_links, facebook: e.target.value } })} placeholder="https://facebook.com/..." style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: "12px", marginBottom: "4px" }}>X (Twitter)</label>
                <input value={settings.career_social_links?.x || ""} onChange={e => setSettings({ ...settings, career_social_links: { ...settings.career_social_links, x: e.target.value } })} placeholder="https://x.com/..." style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: "12px", marginBottom: "4px" }}>Instagram</label>
                <input value={settings.career_social_links?.instagram || ""} onChange={e => setSettings({ ...settings, career_social_links: { ...settings.career_social_links, instagram: e.target.value } })} placeholder="https://instagram.com/..." style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: "12px", marginBottom: "4px" }}>Company Website</label>
                <input value={settings.career_social_links?.website || ""} onChange={e => setSettings({ ...settings, career_social_links: { ...settings.career_social_links, website: e.target.value } })} placeholder="https://..." style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
              </div>
            </div>
          </div>

          {/* Contact Email */}
          <div>
            <label style={labelStyle}>Contact Email</label>
            <input
              value={settings.career_contact_email || ""}
              onChange={e => setSettings({ ...settings, career_contact_email: e.target.value })}
              placeholder="careers@yourcompany.com"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = GOLD}
              onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
            />
            <p className="text-xs mt-1.5" style={{ color: MUTED }}>Email address candidates can reach for career inquiries.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 sticky bottom-0" style={{ borderTop: "1px solid rgba(184,149,106,0.15)", backgroundColor: "#FFFFFF" }}>
          <button onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-semibold" style={{ border: "1px solid rgba(184,149,106,0.3)", color: TEXT_DARK }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: CREAM }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}