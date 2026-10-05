import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, Save } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.6)";
const CREAM = "#FFFBF5";

const inputStyle = {
  border: "1px solid rgba(184,149,106,0.25)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "14px",
  color: TEXT_DARK,
  width: "100%",
  outline: "none",
  backgroundColor: "#FFFFFF",
};

const labelStyle = {
  fontSize: "13px",
  fontWeight: 600,
  color: "rgba(26,26,26,0.7)",
  marginBottom: "6px",
  display: "block",
};

// Maps a section key to the editable job fields it owns.
const SECTION_FIELDS = {
  hero: [
    { key: "title", label: "Job title", type: "input" },
    { key: "hero_badge", label: "Hero badge (e.g. Now Hiring)", type: "input" },
    { key: "page_description", label: "Hero subtitle / intro paragraph", type: "textarea", rows: 5 },
    { key: "location", label: "Location", type: "input" },
    { key: "employment_type", label: "Employment type", type: "select", options: [
      { value: "full_time", label: "Full Time" },
      { value: "part_time", label: "Part Time" },
      { value: "contract", label: "Contract" },
      { value: "temporary", label: "Temporary" },
      { value: "internship", label: "Internship" },
    ] },
    { key: "work_arrangement", label: "Work arrangement (e.g. remote, onsite)", type: "input" },
    { key: "compensation", label: "Compensation summary", type: "input" },
    { key: "work_schedule", label: "Work schedule", type: "input" },
  ],
  about: [
    { key: "description_text", label: "About the role (main paragraph)", type: "textarea", rows: 6, hint: "The primary description shown in the About section." },
    { key: "page_description", label: "Secondary highlight (optional)", type: "textarea", rows: 4, hint: "Shown as a highlighted callout when different from the main paragraph." },
  ],
  responsibilities: [
    { key: "responsibilities", label: "Responsibilities (one per line)", type: "list", rows: 6 },
  ],
  qualifications: [
    { key: "required_qualifications", label: "Required qualifications (one per line)", type: "list", rows: 6 },
  ],
  preferred: [
    { key: "preferred_qualifications", label: "Preferred qualifications (one per line)", type: "list", rows: 5 },
  ],
  experience: [
    { key: "experience_requirements", label: "Experience requirements", type: "textarea", rows: 4 },
  ],
  performance: [
    { key: "performance_expectations", label: "Performance expectations (one per line)", type: "list", rows: 5 },
  ],
  skills: [
    { key: "skills", label: "Key skills (one per line)", type: "list", rows: 5 },
  ],
  compensation: [
    { key: "compensation", label: "Compensation summary", type: "input" },
    { key: "work_schedule", label: "Work schedule", type: "input" },
    { key: "employment_type", label: "Employment type", type: "select", options: [
      { value: "full_time", label: "Full Time" },
      { value: "part_time", label: "Part Time" },
      { value: "contract", label: "Contract" },
      { value: "temporary", label: "Temporary" },
      { value: "internship", label: "Internship" },
    ] },
  ],
  benefits: [
    { key: "benefits", label: "Benefits (one per line)", type: "list", rows: 6 },
  ],
};

export default function JobSectionEditorModal({ sectionKey, job, jobId, salesEmail, salesMemberId, onClose, onSaved }) {
  const fields = SECTION_FIELDS[sectionKey] || [];
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const init = {};
    fields.forEach((f) => {
      const v = job?.[f.key];
      init[f.key] = Array.isArray(v) ? v.join("\n") : (v ?? "");
    });
    setValues(init);
  }, [sectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (key, val) => setValues((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {};
      fields.forEach((f) => {
        const raw = values[f.key] ?? "";
        if (f.type === "list") {
          payload[f.key] = String(raw).split("\n").map((s) => s.trim()).filter(Boolean);
        } else {
          payload[f.key] = raw;
        }
      });
      // Preserve existing design_spec — the update action merges by replacing,
      // so pass the current one through.
      const designSpec = job?.design_spec || null;
      const res = await base44.functions.invoke("createJobPage", {
        action: "update",
        job_opening_id: jobId,
        email: salesEmail,
        sales_member_id: salesMemberId,
        design_spec: designSpec,
        ...payload,
      });
      const d = res?.data ?? res;
      if (d?.success) {
        onSaved?.(d.job_opening || { ...job, ...payload });
      } else {
        setErr(d?.error || "Failed to save changes");
      }
    } catch (e) {
      setErr(e.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      style={{ backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (!saving) { e.stopPropagation(); onClose?.(); } }}
    >
      <div
        className="max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
          <h3 className="text-base font-bold" style={{ color: TEXT_DARK }}>
            {sectionKey === "hero" ? "Edit header" : "Edit section"}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5">
            <X className="w-4 h-4" style={{ color: MUTED }} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label style={labelStyle}>{f.label}</label>
              {f.type === "textarea" || f.type === "list" ? (
                <textarea
                  value={values[f.key] ?? ""}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                  rows={f.rows || 4}
                  style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={(e) => (e.target.style.borderColor = GOLD)}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(184,149,106,0.25)")}
                />
              ) : f.type === "select" ? (
                <select
                  value={values[f.key] ?? ""}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                  style={inputStyle}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[f.key] ?? ""}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = GOLD)}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(184,149,106,0.25)")}
                />
              )}
              {f.hint && <p className="text-xs mt-1.5" style={{ color: MUTED }}>{f.hint}</p>}
            </div>
          ))}

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid rgba(184,149,106,0.3)", color: TEXT_DARK }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: CREAM }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}