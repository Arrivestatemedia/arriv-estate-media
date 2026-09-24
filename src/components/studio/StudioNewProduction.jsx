import React, { useState } from "react";
import { ArrowLeft, ArrowRight, Upload, Sparkles, Check } from "lucide-react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  bg: "#0f0f0f", container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F", inputBg: "#1a1a1a",
};

// Studio New Production — 3-step wizard matching canonical Arriv Studio.
// Step 1: Project (name, type, source, industry, format, runtime, destination)
// Step 2: Creative Brief (description, content type, audience, objective, tone, CTA, etc.)
// Step 3: Review (summary + create)
// Real-estate adapted: project types and industry context for real estate.
export default function StudioNewProduction({ project, onCreate, onCancel }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    // Step 1 — Project (pre-filled from project prop when coming from a booking)
    projectName: project?.projectName || "",
    projectType: project?.projectType || "Property Listing",
    sourceProduct: project?.sourceProduct || "Standalone",
    industryContext: project?.industryContext || "Real estate",
    outputFormat: project?.outputFormat || "16:9",
    targetRuntime: project?.targetRuntime || "2",
    destination: project?.destination || "",
    // Step 2 — Creative Brief
    description: "",
    contentType: "",
    audience: "",
    objective: "",
    tone: "Professional",
    callToAction: "",
    requiredInfo: "",
    prohibitedClaims: "",
    brandRequirements: "",
    presenterPreferences: "",
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const canContinue = () => {
    if (step === 1) return form.projectName.trim() !== "";
    if (step === 2) return form.description.trim() !== "";
    return true;
  };

  const handleContinue = () => {
    if (step < 3) setStep(step + 1);
    else onCreate?.(form);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else onCancel?.();
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8" style={{ ...STUDIO_FONT }}>
      {/* Back link */}
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-sm mb-6 hover:opacity-70"
        style={{ color: C.muted }}
      >
        <ArrowLeft className="w-4 h-4" /> Back to projects
      </button>

      {/* Title */}
      <h1 className="text-2xl font-bold mb-1" style={{ color: C.text }}>New Production</h1>
      <p className="text-sm mb-8" style={{ color: C.muted }}>
        Describe what you want — Studio handles the rest of the lifecycle.
      </p>

      {/* Stepper */}
      <div className="flex items-center mb-8">
        {["Project", "Creative Brief", "Review"].map((label, i) => {
          const stepNum = i + 1;
          const active = step === stepNum;
          const done = step > stepNum;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: active || done ? C.accent : "#2d2d2d",
                    color: active || done ? "#ffffff" : C.muted,
                  }}
                >
                  {done ? <Check className="w-4 h-4" /> : stepNum}
                </div>
                <span className="text-xs mt-1.5" style={{ color: active ? C.text : C.muted }}>
                  {label}
                </span>
              </div>
              {i < 2 && (
                <div className="flex-1 h-0.5 mx-2 -mt-5" style={{ background: done ? C.accent : C.border }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-xl p-6 space-y-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        {step === 1 && <StepProject form={form} set={set} />}
        {step === 2 && <StepCreativeBrief form={form} set={set} />}
        {step === 3 && <StepReview form={form} />}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={handleBack}
          className="text-sm font-medium hover:opacity-70"
          style={{ color: C.muted }}
        >
          {step > 1 ? "Back" : "Cancel"}
        </button>
        <button
          onClick={handleContinue}
          disabled={!canContinue()}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-40"
          style={{ background: C.accent, color: "#ffffff" }}
        >
          {step < 3 ? "Continue" : "Create Project"} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StepProject({ form, set }) {
  return (
    <>
      <Field label="Project name" required>
        <input
          value={form.projectName}
          onChange={(e) => set("projectName", e.target.value)}
          placeholder="e.g. 123 Main St Listing Video"
          style={inputStyle}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Project type">
          <Select value={form.projectType} onChange={(v) => set("projectType", v)} options={[
            "Property Listing", "Agent Promo", "Brokerage Brand", "Open House",
            "Market Update", "Neighborhood Tour", "Client Testimonial", "Training",
          ]} />
        </Field>
        <Field label="Source product">
          <Select value={form.sourceProduct} onChange={(v) => set("sourceProduct", v)} options={[
            "Standalone", "Estate Media Booking", "Upload",
          ]} />
        </Field>
      </div>
      <Field label="Industry context">
        <input
          value={form.industryContext}
          onChange={(e) => set("industryContext", e.target.value)}
          placeholder="e.g. Real estate, Luxury, Commercial"
          style={inputStyle}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Output format">
          <Select value={form.outputFormat} onChange={(v) => set("outputFormat", v)} options={["16:9", "9:16", "1:1", "4:5"]} />
        </Field>
        <Field label="Target runtime (min)">
          <input
            type="number"
            value={form.targetRuntime}
            onChange={(e) => set("targetRuntime", e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>
      <Field label="Destination">
        <input
          value={form.destination}
          onChange={(e) => set("destination", e.target.value)}
          placeholder="e.g. MLS, YouTube, Instagram"
          style={inputStyle}
        />
      </Field>
    </>
  );
}

function StepCreativeBrief({ form, set }) {
  return (
    <>
      <Field label="Describe what you want" required>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="In natural language, describe the real-estate video you want to produce..."
          rows={4}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Content type">
          <input value={form.contentType} onChange={(e) => set("contentType", e.target.value)} placeholder="e.g. Listing Tour, Testimonial" style={inputStyle} />
        </Field>
        <Field label="Audience">
          <input value={form.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Who is this for?" style={inputStyle} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Objective">
          <input value={form.objective} onChange={(e) => set("objective", e.target.value)} placeholder="e.g. Drive inquiries" style={inputStyle} />
        </Field>
        <Field label="Tone">
          <input value={form.tone} onChange={(e) => set("tone", e.target.value)} placeholder="Professional" style={inputStyle} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Call to action">
          <input value={form.callToAction} onChange={(e) => set("callToAction", e.target.value)} placeholder="e.g. Book a showing today" style={inputStyle} />
        </Field>
        <Field label="Required information">
          <input value={form.requiredInfo} onChange={(e) => set("requiredInfo", e.target.value)} placeholder="Must-include details" style={inputStyle} />
        </Field>
      </div>
      <Field label="Prohibited claims">
        <input value={form.prohibitedClaims} onChange={(e) => set("prohibitedClaims", e.target.value)} placeholder="Claims to avoid" style={inputStyle} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Brand requirements">
          <input value={form.brandRequirements} onChange={(e) => set("brandRequirements", e.target.value)} placeholder="Brand guidelines" style={inputStyle} />
        </Field>
        <Field label="Presenter preferences">
          <input value={form.presenterPreferences} onChange={(e) => set("presenterPreferences", e.target.value)} placeholder="Presenter style" style={inputStyle} />
        </Field>
      </div>
      <Field label="Reference materials">
        <div
          className="rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#FF5A4F]/40 transition-colors"
          style={{ border: "2px dashed #2d2d2d", background: "transparent" }}
        >
          <Upload className="w-6 h-6" style={{ color: C.muted }} />
          <p className="text-xs text-center" style={{ color: C.muted }}>
            Upload PDF, DOC/DOCX, PPT/PPTX, images, screenshots, logos, video, brand docs, SOPs
          </p>
        </div>
      </Field>
    </>
  );
}

function StepReview({ form }) {
  const rows = [
    { label: "Name", value: form.projectName },
    { label: "Type", value: form.projectType },
    { label: "Format", value: form.outputFormat },
    { label: "Runtime", value: `${form.targetRuntime} min` },
    { label: "Description", value: form.description },
    { label: "Audience", value: form.audience || "—" },
    { label: "Objective", value: form.objective || "—" },
    { label: "CTA", value: form.callToAction || "—" },
    { label: "Tone", value: form.tone },
    { label: "Industry", value: form.industryContext },
    { label: "Destination", value: form.destination || "—" },
  ];
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5" style={{ color: C.accent }} />
        <h2 className="text-lg font-bold" style={{ color: C.text }}>Ready to create</h2>
      </div>
      <div className="divide-y" style={{ borderColor: C.border }}>
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between py-3" style={{ borderColor: C.border }}>
            <span className="text-sm" style={{ color: C.muted }}>{r.label}</span>
            <span className="text-sm font-medium text-right max-w-[60%]" style={{ color: C.text }}>{r.value || "—"}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// --- Helpers ---
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  background: "#1a1a1a",
  border: "1px solid #2d2d2d",
  color: "#ffffff",
  fontSize: "14px",
  outline: "none",
};

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: C.muted }}>
        {label}{required && <span style={{ color: C.accent }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle}
    >
      {options.map((o) => <option key={o} value={o} style={{ background: "#1a1a1a" }}>{o}</option>)}
    </select>
  );
}