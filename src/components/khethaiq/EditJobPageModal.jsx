import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, Palette, Save, Eye } from "lucide-react";

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
  padding: "10px 14px",
  fontSize: "14px",
  color: TEXT_DARK,
  width: "100%",
  outline: "none",
};

const labelStyle = {
  fontSize: "13px",
  fontWeight: 600,
  color: "rgba(26,26,26,0.7)",
  marginBottom: "6px",
  display: "block",
};

const focusProps = {
  onFocus: (e) => (e.target.style.borderColor = GOLD),
  onBlur: (e) => (e.target.style.borderColor = "rgba(184,149,106,0.2)"),
};

export default function EditJobPageModal({ jobOpening, previewUrl, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({
    title: jobOpening.title || "",
    department: jobOpening.department || "",
    description: jobOpening.description_text || "",
    location: jobOpening.location || "",
    employment_type: jobOpening.employment_type || "full_time",
    work_arrangement: jobOpening.work_arrangement || "onsite",
    compensation: jobOpening.compensation || "",
    work_schedule: jobOpening.work_schedule || "",
    experience_requirements: jobOpening.experience_requirements || "",
    travel_requirements: jobOpening.travel_requirements || "",
    skills: Array.isArray(jobOpening.skills) ? jobOpening.skills : [],
    responsibilities: Array.isArray(jobOpening.responsibilities) ? jobOpening.responsibilities : [],
    required_qualifications: Array.isArray(jobOpening.required_qualifications) ? jobOpening.required_qualifications : [],
    preferred_qualifications: Array.isArray(jobOpening.preferred_qualifications) ? jobOpening.preferred_qualifications : [],
    benefits: Array.isArray(jobOpening.benefits) ? jobOpening.benefits : [],
    page_description: jobOpening.page_description || "",
    design_description: jobOpening.design_description || "",
    public_visibility: jobOpening.public_visibility !== false,
    status: jobOpening.status || "open",
  });

  const set = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!fields.title) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke("createJobPage", {
        action: "update",
        job_opening_id: jobOpening.id,
        ...fields,
      });
      const data = res?.data ?? res;
      if (data?.success) {
        onSaved?.(data.job_opening);
      } else {
        alert(data?.error || "Failed to save changes");
      }
    } catch (err) {
      alert("Save failed: " + (err.message || "unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = previewUrl || `/careers/${jobOpening.public_slug || jobOpening.job_id}`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      style={{ backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (!saving) {
          e.stopPropagation();
          onClose?.();
        }
      }}
    >
      <div
        className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 sticky top-0 bg-white z-10"
          style={{ borderBottom: "1px solid rgba(184,149,106,0.15)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "rgba(184,149,106,0.12)" }}
            >
              <Palette className="w-4 h-4" style={{ color: GOLD }} />
            </div>
            <h2 className="text-lg font-bold" style={{ ...SERIF, color: TEXT_DARK }}>
              Edit Job Page
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
          >
            <X className="w-5 h-5" style={{ color: MUTED }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Page description */}
          <div>
            <label style={labelStyle}>Page Description</label>
            <textarea
              value={fields.page_description}
              onChange={(e) => set("page_description", e.target.value)}
              placeholder="Describe what you want the page to convey..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical", minHeight: "70px" }}
              {...focusProps}
            />
            <p className="text-xs mt-1.5" style={{ color: MUTED }}>
              Natural-language description of what the page should convey to candidates.
            </p>
          </div>

          {/* Design description */}
          <div>
            <label className="flex items-center gap-1.5" style={labelStyle}>
              <Palette className="w-3.5 h-3.5" style={{ color: GOLD }} />
              Design Description
            </label>
            <textarea
              value={fields.design_description}
              onChange={(e) => set("design_description", e.target.value)}
              placeholder="Describe the desired design: colors, structure, layout style, tone... e.g. 'Use a warm, inviting layout with gold accents. Hero section with a large photo. Clean, modern structure with clear section breaks.'"
              rows={3}
              style={{ ...inputStyle, resize: "vertical", minHeight: "70px" }}
              {...focusProps}
            />
            <p className="text-xs mt-1.5" style={{ color: MUTED }}>
              Describe the visual design of the page — colors, structure, layout style, and tone.
            </p>
          </div>

          <div style={{ borderTop: "1px solid rgba(184,149,106,0.12)", paddingTop: "16px" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ ...SERIF, color: TEXT_DARK }}>
              Job Details
            </h3>
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Job Title</label>
            <input
              value={fields.title}
              onChange={(e) => set("title", e.target.value)}
              style={inputStyle}
              {...focusProps}
            />
          </div>

          {/* Department + Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Department</label>
              <input
                value={fields.department}
                onChange={(e) => set("department", e.target.value)}
                style={inputStyle}
                {...focusProps}
              />
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <input
                value={fields.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="City, State or Remote"
                style={inputStyle}
                {...focusProps}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={fields.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
              {...focusProps}
            />
          </div>

          {/* Employment type + Work arrangement */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Employment Type</label>
              <select
                value={fields.employment_type}
                onChange={(e) => set("employment_type", e.target.value)}
                style={inputStyle}
              >
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="temporary">Temporary</option>
                <option value="internship">Internship</option>
                <option value="volunteer">Volunteer</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Work Arrangement</label>
              <select
                value={fields.work_arrangement}
                onChange={(e) => set("work_arrangement", e.target.value)}
                style={inputStyle}
              >
                <option value="onsite">Onsite</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </select>
            </div>
          </div>

          {/* Compensation + Work schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Compensation</label>
              <input
                value={fields.compensation}
                onChange={(e) => set("compensation", e.target.value)}
                style={inputStyle}
                {...focusProps}
              />
            </div>
            <div>
              <label style={labelStyle}>Work Schedule</label>
              <input
                value={fields.work_schedule}
                onChange={(e) => set("work_schedule", e.target.value)}
                style={inputStyle}
                {...focusProps}
              />
            </div>
          </div>

          {/* Experience + Travel */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Experience Requirements</label>
              <input
                value={fields.experience_requirements}
                onChange={(e) => set("experience_requirements", e.target.value)}
                style={inputStyle}
                {...focusProps}
              />
            </div>
            <div>
              <label style={labelStyle}>Travel Requirements</label>
              <input
                value={fields.travel_requirements}
                onChange={(e) => set("travel_requirements", e.target.value)}
                style={inputStyle}
                {...focusProps}
              />
            </div>
          </div>

          {/* Skills */}
          <div>
            <label style={labelStyle}>Skills (comma-separated)</label>
            <input
              value={Array.isArray(fields.skills) ? fields.skills.join(", ") : ""}
              onChange={(e) =>
                set("skills", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
              }
              style={inputStyle}
              {...focusProps}
            />
          </div>

          {/* Responsibilities */}
          <div>
            <label style={labelStyle}>Responsibilities (one per line)</label>
            <textarea
              value={Array.isArray(fields.responsibilities) ? fields.responsibilities.join("\n") : ""}
              onChange={(e) =>
                set("responsibilities", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))
              }
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
              {...focusProps}
            />
          </div>

          {/* Required Qualifications */}
          <div>
            <label style={labelStyle}>Required Qualifications (one per line)</label>
            <textarea
              value={
                Array.isArray(fields.required_qualifications)
                  ? fields.required_qualifications.join("\n")
                  : ""
              }
              onChange={(e) =>
                set(
                  "required_qualifications",
                  e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                )
              }
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
              {...focusProps}
            />
          </div>

          {/* Preferred Qualifications */}
          <div>
            <label style={labelStyle}>Preferred Qualifications (one per line)</label>
            <textarea
              value={
                Array.isArray(fields.preferred_qualifications)
                  ? fields.preferred_qualifications.join("\n")
                  : ""
              }
              onChange={(e) =>
                set(
                  "preferred_qualifications",
                  e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                )
              }
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              {...focusProps}
            />
          </div>

          {/* Benefits */}
          <div>
            <label style={labelStyle}>Benefits (one per line)</label>
            <textarea
              value={Array.isArray(fields.benefits) ? fields.benefits.join("\n") : ""}
              onChange={(e) =>
                set("benefits", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))
              }
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              {...focusProps}
            />
          </div>

          {/* Status + Visibility */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={fields.status}
                onChange={(e) => set("status", e.target.value)}
                style={inputStyle}
              >
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="paused">Paused</option>
                <option value="closed">Closed</option>
                <option value="filled">Filled</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Public Visibility</label>
              <select
                value={fields.public_visibility ? "true" : "false"}
                onChange={(e) => set("public_visibility", e.target.value === "true")}
                style={inputStyle}
              >
                <option value="true">Visible</option>
                <option value="false">Hidden</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-6 py-4 sticky bottom-0 bg-white"
          style={{ borderTop: "1px solid rgba(184,149,106,0.15)" }}
        >
          <button
            onClick={() => window.open(publicUrl, "_blank")}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              border: "1px solid rgba(184,149,106,0.3)",
              color: TEXT_DARK,
              backgroundColor: "transparent",
            }}
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              border: "1px solid rgba(184,149,106,0.3)",
              color: TEXT_DARK,
              backgroundColor: "transparent",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !fields.title}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: CREAM }}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}