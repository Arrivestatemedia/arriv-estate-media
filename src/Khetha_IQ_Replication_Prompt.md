# Khetha IQ — Recent Changes: Job Page Management System (Exact Replication)

Copy and paste the block below into the Khetha IQ builder chat. It contains the **full source code** for every new component and the exact modifications to the Khetha IQ page. Paste each file verbatim — do not modify styles, icons, colors, or structure.

---

## COPY EVERYTHING BELOW THIS LINE

I need you to replicate the following recent changes to our Khetha IQ page. These are job page management features finalized in our Estate Media app. Each section contains the **exact code** to use — do not change any styles, icons, colors, spacing, or structure.

### Overview

**6 changes:**

1. **Top bar buttons** — "Create Job Page" and "Careers Hub" buttons added to the Khetha IQ top action bar
2. **Create Job Page modal (JobPageBuilder)** — 3-step AI wizard that analyzes a job description and creates a public job page
3. **Edit Job Page modal (EditJobPageModal)** — edit an existing job page with live preview
4. **Careers Hub Settings modal (CareersHubSettings)** — configure the public careers hub
5. **Job card action buttons** — "View Listing", "Edit Page", "Duplicate" buttons on each job card
6. **Duplicate + Edit Page logic** — duplicate jobs/pages with "(Copy)" suffix, link HireJobs to JobOpenings via source_url

---

### Shared Constants (used in all files)

```js
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
```

---

### Change 1: Top Bar Buttons

**File:** `src/pages/KhethaIQ.jsx` — replace the existing top bar `<div className="flex items-center gap-2 flex-wrap">` section with this exact code. The "Create Job Page" and "Careers Hub" buttons go BEFORE the existing "Request New Hire" button.

**State variables to add** (at the top of the KhethaIQ component, alongside existing state):
```jsx
const [showJobPageBuilder, setShowJobPageBuilder] = useState(false);
const [showCareersHubSettings, setShowCareersHubSettings] = useState(false);
const [editingJobOpening, setEditingJobOpening] = useState(null);
const [editingPreviewUrl, setEditingPreviewUrl] = useState(null);
const [jobOpenings, setJobOpenings] = useState([]);
const [linkingJob, setLinkingJob] = useState(null);
const [duplicating, setDuplicating] = useState(null);
```

**Imports to add** (at the top of KhethaIQ.jsx):
```jsx
import JobPageBuilder from "@/components/khethaiq/JobPageBuilder";
import EditJobPageModal from "@/components/khethaiq/EditJobPageModal";
import CareersHubSettings from "@/components/khethaiq/CareersHubSettings";
import { Copy } from "lucide-react"; // add Copy to the existing lucide-react import
```

**Top bar JSX** (replace the right-side button group):
```jsx
<div className="flex items-center gap-2 flex-wrap">
  <Button
    onClick={() => setShowJobPageBuilder(true)}
    className="gap-1.5"
    style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}
  >
    <Plus className="w-4 h-4" />
    Create Job Page
  </Button>
  <Button
    onClick={() => setShowCareersHubSettings(true)}
    variant="outline"
    className="gap-1.5"
    style={{ backgroundColor: "#FFFFFF", color: TEXT_DARK, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}
  >
    <Globe className="w-4 h-4" />
    Careers Hub
  </Button>
  <Button
    onClick={() => setShowCreate(true)}
    variant="outline"
    className="gap-1.5"
    style={{ backgroundColor: "#FFFFFF", color: TEXT_DARK, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}
  >
    <Sparkles className="w-4 h-4" />
    Request New Hire
  </Button>
</div>
```

**Modal renders** (add at the bottom of the KhethaIQ component, before the closing `</div>`):
```jsx
{/* Create Job Page modal */}
{showJobPageBuilder && (
  <JobPageBuilder
    onClose={() => setShowJobPageBuilder(false)}
    onCreated={() => { loadJobs(); }}
  />
)}

{/* Careers Hub Settings modal */}
{showCareersHubSettings && (
  <CareersHubSettings onClose={() => setShowCareersHubSettings(false)} />
)}

{/* Edit Job Page modal */}
{editingJobOpening && (
  <EditJobPageModal
    jobOpening={editingJobOpening}
    previewUrl={editingPreviewUrl}
    onClose={() => { setEditingJobOpening(null); setEditingPreviewUrl(null); }}
    onSaved={(updated) => {
      setEditingJobOpening(null);
      setEditingPreviewUrl(null);
      setJobOpenings(prev => prev.map(j => j.id === updated?.id ? { ...j, ...updated } : j));
    }}
  />
)}
```

---

### Change 2: Create Job Page Modal (JobPageBuilder)

**File:** `src/components/khethaiq/JobPageBuilder.jsx` — create this file with the EXACT code below.

```jsx
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Globe, X, Sparkles, FileText, Link as LinkIcon, Upload, Loader2, Check, ArrowLeft, Copy, Palette } from "lucide-react";

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

export default function JobPageBuilder({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pageDescription, setPageDescription] = useState("");
  const [designDescription, setDesignDescription] = useState("");
  const [sourceTab, setSourceTab] = useState("text");
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [createdUrl, setCreatedUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const [fields, setFields] = useState({
    title: "", department: "", description: "",
    responsibilities: [], required_qualifications: [], preferred_qualifications: [],
    skills: [], experience_requirements: "", performance_expectations: [],
    compensation: "", work_schedule: "",
    employment_type: "full_time", work_arrangement: "onsite", location: "",
  });

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await base44.functions.invoke("createJobPage", {
        action: "analyze",
        page_description: pageDescription,
        design_description: designDescription,
        source_type: sourceTab,
        source_text: sourceText,
        source_url: sourceUrl,
        file_url: fileUrl,
      });
      const data = res?.data ?? res;
      if (data?.extracted) {
        setExtracted(data.extracted);
        setFields({
          title: data.extracted.title || "",
          department: data.extracted.department || "",
          description: data.extracted.description || "",
          responsibilities: data.extracted.responsibilities || [],
          required_qualifications: data.extracted.required_qualifications || [],
          preferred_qualifications: data.extracted.preferred_qualifications || [],
          skills: data.extracted.skills || [],
          experience_requirements: data.extracted.experience_requirements || "",
          performance_expectations: data.extracted.performance_expectations || [],
          compensation: data.extracted.compensation || "",
          work_schedule: data.extracted.work_schedule || "",
          employment_type: "full_time",
          work_arrangement: "onsite",
          location: "",
        });
        setStep(2);
      } else {
        alert("Failed to analyze job description");
      }
    } catch (err) {
      alert("Analysis failed: " + (err.message || "unknown error"));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = async (file) => {
    setUploading(true);
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const url = uploadRes?.file_url || uploadRes?.data?.file_url;
      setFileUrl(url);
      setFileName(file.name);
    } catch (err) {
      alert("Upload failed: " + (err.message || "unknown error"));
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await base44.functions.invoke("createJobPage", {
        action: "create",
        page_description: pageDescription,
        design_description: designDescription,
        source_type: sourceTab,
        source_text: sourceText,
        source_url: sourceUrl,
        file_url: fileUrl,
        title: fields.title,
        department: fields.department,
        description: fields.description,
        responsibilities: fields.responsibilities,
        required_qualifications: fields.required_qualifications,
        preferred_qualifications: fields.preferred_qualifications,
        skills: fields.skills,
        experience_requirements: fields.experience_requirements,
        performance_expectations: fields.performance_expectations,
        compensation: fields.compensation,
        work_schedule: fields.work_schedule,
        employment_type: fields.employment_type,
        work_arrangement: fields.work_arrangement,
        location: fields.location,
      });
      const data = res?.data ?? res;
      if (data?.success) {
        setCreatedUrl(data.public_url);
        setStep(3);
        onCreated?.(data.job_opening);
      } else {
        alert(data?.error || "Failed to create job page");
      }
    } catch (err) {
      alert("Creation failed: " + (err.message || "unknown error"));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(createdUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canAnalyze = pageDescription.trim() || sourceText.trim() || sourceUrl.trim() || fileUrl;

  const tabs = [
    { id: "text", label: "Text", icon: FileText },
    { id: "url", label: "URL", icon: LinkIcon },
    { id: "file", label: "File", icon: Upload },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" style={{ backdropFilter: "blur(6px)" }} onClick={e => { if (!analyzing && !creating) { e.stopPropagation(); onClose?.(); } }}>
      <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(184,149,106,0.15)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>
              <Globe className="w-4 h-4" style={{ color: GOLD }} />
            </div>
            <h2 className="text-lg font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Create Job Page</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X className="w-5 h-5" style={{ color: MUTED }} />
          </button>
        </div>

        {/* Step 1: Input */}
        {step === 1 && (
          <div className="px-6 py-5 space-y-5">
            <div>
              <label className="flex items-center gap-1.5" style={labelStyle}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: GOLD }} />
                Describe what you want
              </label>
              <textarea
                value={pageDescription}
                onChange={e => setPageDescription(e.target.value)}
                placeholder="Describe the role and what you want the page to convey. e.g. 'We're hiring a real estate photographer. Emphasize flexibility, creative freedom, and growth opportunities.'"
                rows={3}
                style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
              />
              <p className="text-xs mt-1.5" style={{ color: MUTED }}>This description appears on the public career page and gives the AI context for better analysis.</p>
            </div>

            <div>
              <label className="flex items-center gap-1.5" style={labelStyle}>
                <Palette className="w-3.5 h-3.5" style={{ color: GOLD }} />
                Describe the page design
              </label>
              <textarea
                value={designDescription}
                onChange={e => setDesignDescription(e.target.value)}
                placeholder="Describe the visual design: colors, structure, layout style, tone... e.g. 'Warm, inviting layout with gold accents. Hero section with a large photo. Clean, modern structure with clear section breaks.'"
                rows={3}
                style={{ ...inputStyle, resize: "vertical", minHeight: "70px" }}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
              />
              <p className="text-xs mt-1.5" style={{ color: MUTED }}>Describe the colors, structure, and layout style you want for the page.</p>
            </div>

            <div>
              <label style={labelStyle}>Job Description Source</label>
              <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.06)" }}>
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const active = sourceTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setSourceTab(tab.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all"
                      style={{
                        backgroundColor: active ? "rgba(184,149,106,0.15)" : "transparent",
                        border: active ? "1px solid rgba(184,149,106,0.4)" : "1px solid transparent",
                        color: active ? GOLD_DARK : MUTED,
                      }}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3">
                {sourceTab === "text" && (
                  <textarea
                    value={sourceText}
                    onChange={e => setSourceText(e.target.value)}
                    placeholder="Paste the full job description here..."
                    rows={6}
                    style={{ ...inputStyle, resize: "vertical" }}
                    onFocus={e => e.target.style.borderColor = GOLD}
                    onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
                  />
                )}
                {sourceTab === "url" && (
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    placeholder="https://example.com/job-posting"
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = GOLD}
                    onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
                  />
                )}
                {sourceTab === "file" && (
                  <label
                    className="flex flex-col items-center justify-center gap-2 p-8 rounded-lg cursor-pointer transition-all"
                    style={{ border: "2px dashed rgba(184,149,106,0.3)", backgroundColor: "rgba(184,149,106,0.04)" }}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
                        <span className="text-sm" style={{ color: MUTED }}>Uploading...</span>
                      </>
                    ) : fileUrl ? (
                      <>
                        <FileText className="w-6 h-6" style={{ color: GOLD }} />
                        <span className="text-sm font-medium" style={{ color: TEXT_DARK }}>{fileName}</span>
                        <span className="text-xs" style={{ color: MUTED }}>Click to replace</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-6 h-6" style={{ color: GOLD }} />
                        <span className="text-sm" style={{ color: MUTED }}>Upload PDF, DOC, DOCX, or TXT</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                    />
                  </label>
                )}
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze || analyzing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: analyzing ? "rgba(184,149,106,0.5)" : GOLD, color: CREAM }}
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Analyze & Create Job Page
                </>
              )}
            </button>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-2 pb-3" style={{ borderBottom: "1px solid rgba(184,149,106,0.15)" }}>
              <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm font-medium hover:opacity-70" style={{ color: GOLD }}>
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <span className="text-sm font-medium" style={{ color: MUTED }}>Review extracted details</span>
            </div>

            <div>
              <label style={labelStyle}>Job Title</label>
              <input value={fields.title} onChange={e => setFields({ ...fields, title: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>Department</label>
                <input value={fields.department} onChange={e => setFields({ ...fields, department: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <input value={fields.location} onChange={e => setFields({ ...fields, location: e.target.value })} placeholder="City, State or Remote" style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Description</label>
              <textarea value={fields.description} onChange={e => setFields({ ...fields, description: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical" }} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>Employment Type</label>
                <select value={fields.employment_type} onChange={e => setFields({ ...fields, employment_type: e.target.value })} style={inputStyle}>
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
                <select value={fields.work_arrangement} onChange={e => setFields({ ...fields, work_arrangement: e.target.value })} style={inputStyle}>
                  <option value="onsite">Onsite</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="remote">Remote</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>Compensation</label>
                <input value={fields.compensation} onChange={e => setFields({ ...fields, compensation: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
              </div>
              <div>
                <label style={labelStyle}>Work Schedule</label>
                <input value={fields.work_schedule} onChange={e => setFields({ ...fields, work_schedule: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Experience Requirements</label>
              <input value={fields.experience_requirements} onChange={e => setFields({ ...fields, experience_requirements: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
            </div>

            <div>
              <label style={labelStyle}>Skills (comma-separated)</label>
              <input
                value={Array.isArray(fields.skills) ? fields.skills.join(", ") : ""}
                onChange={e => setFields({ ...fields, skills: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
              />
            </div>

            <div>
              <label style={labelStyle}>Responsibilities (one per line)</label>
              <textarea
                value={Array.isArray(fields.responsibilities) ? fields.responsibilities.join("\n") : ""}
                onChange={e => setFields({ ...fields, responsibilities: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
                rows={4}
                style={{ ...inputStyle, resize: "vertical" }}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
              />
            </div>

            <div>
              <label style={labelStyle}>Required Qualifications (one per line)</label>
              <textarea
                value={Array.isArray(fields.required_qualifications) ? fields.required_qualifications.join("\n") : ""}
                onChange={e => setFields({ ...fields, required_qualifications: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
                rows={4}
                style={{ ...inputStyle, resize: "vertical" }}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-lg text-sm font-semibold transition-all" style={{ border: "1px solid rgba(184,149,106,0.3)", color: TEXT_DARK, backgroundColor: "transparent" }}>
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !fields.title}
                className="flex-1 py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                style={{ backgroundColor: GOLD, color: CREAM }}
              >
                {creating ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                  </span>
                ) : "Create Job Page"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Created */}
        {step === 3 && (
          <div className="px-6 py-10 text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>
              <Check className="w-8 h-8" style={{ color: GOLD }} />
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ ...SERIF, color: TEXT_DARK }}>Job Page Created!</h3>
            <p className="text-sm mb-5" style={{ color: MUTED }}>Your job page is now live and ready for candidates.</p>

            <div className="flex items-center gap-2 p-3 rounded-lg mb-5" style={{ backgroundColor: "rgba(184,149,106,0.06)", border: "1px solid rgba(184,149,106,0.2)" }}>
              <input value={createdUrl} readOnly className="flex-1 bg-transparent text-sm outline-none" style={{ color: TEXT_DARK }} />
              <button onClick={handleCopy} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium" style={{ backgroundColor: GOLD, color: CREAM }}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ border: "1px solid rgba(184,149,106,0.3)", color: TEXT_DARK }}>
                Close
              </button>
              <button onClick={() => window.open(createdUrl, "_blank")} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: GOLD, color: CREAM }}>
                Preview Page
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### Change 3: Edit Job Page Modal (EditJobPageModal)

**File:** `src/components/khethaiq/EditJobPageModal.jsx` — create this file with the EXACT code below.

```jsx
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
      const adminEmail = localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email') || "";
      const res = await base44.functions.invoke("createJobPage", {
        action: "update",
        job_opening_id: jobOpening.id,
        email: adminEmail,
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
```

---

### Change 4: Careers Hub Settings Modal (CareersHubSettings)

**File:** `src/components/khethaiq/CareersHubSettings.jsx` — create this file with the EXACT code below.

```jsx
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
              onChange={e => setSettings({ ...settings, career_culture_culture_text: e.target.value })}
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
              <div>
                <label style={{ ...labelStyle, fontSize: "12px", marginBottom: "4px" }}>Contact Email</label>
                <input value={settings.career_contact_email || ""} onChange={e => setSettings({ ...settings, career_contact_email: e.target.value })} placeholder="careers@yourcompany.com" style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
              </div>
            </div>
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
```

---

### Change 5: Job Card Action Buttons + Change 6: Duplicate/Edit Page Logic

**File:** `src/pages/KhethaIQ.jsx` — add these functions inside the KhethaIQ component, and update the Jobs view job card JSX.

**Helper functions to add** (inside the component, before the return statement):

```jsx
const normalizeSourcePath = (url) => {
  if (!url) return null;
  try { return new URL(url, window.location.origin).pathname; }
  catch { return url; }
};

const getLegacyPath = (job) => {
  if (!job) return null;
  const isAtl = (job.title || "").toLowerCase().includes("atlanta") || (job.location || "").toLowerCase().includes("atlanta");
  return normalizeSourcePath(job.source_url)
    || (job.source_application_position === "sales_growth_advisor" ? "/SalesGrowthAdvisor"
      : isAtl ? "/MediaSpecialistAtl"
      : job.source_application_position === "media_specialist" ? "/MediaSpecialist" : null);
};

const handleEditPage = async (hireJob) => {
  const legacyUrl = getLegacyPath(hireJob);
  const match = legacyUrl
    ? jobOpenings.find(jo => normalizeSourcePath(jo.source_url) === legacyUrl)
    : jobOpenings.find(jo => jo.title === hireJob.title);
  if (match) {
    if (!match.source_url && legacyUrl) {
      try {
        const upd = await base44.functions.invoke("createJobPage", {
          action: "update",
          job_opening_id: match.id,
          source_url: legacyUrl,
          email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email') || "",
        });
        const updated = upd?.data?.job_opening || upd?.job_opening || { ...match, source_url: legacyUrl };
        setJobOpenings(prev => prev.map(j => j.id === match.id ? { ...j, ...updated } : j));
      } catch (_) {}
    }
    setEditingPreviewUrl(legacyUrl || `/careers/${match.public_slug || match.job_id}`);
    setEditingJobOpening(match);
    return;
  }
  setLinkingJob(hireJob);
  try {
    const d = legacyUrl === "/SalesGrowthAdvisor" ? SALES_JOB_DEFAULTS
      : legacyUrl === "/MediaSpecialistAtl" ? MEDIA_JOB_ATLANTA_DEFAULTS
      : legacyUrl === "/MediaSpecialist" ? MEDIA_JOB_DEFAULTS : {};
    const res = await base44.functions.invoke("createJobPage", {
      action: "create",
      title: d.title || hireJob.title || "Untitled",
      department: hireJob.department || "",
      description: d.description_text || hireJob.description || "",
      responsibilities: d.responsibilities || hireJob.responsibilities || [],
      required_qualifications: d.required_qualifications || hireJob.required_qualifications || [],
      preferred_qualifications: hireJob.preferred_qualifications || [],
      skills: hireJob.skills || [],
      experience_requirements: hireJob.experience_requirements || "",
      compensation: d.compensation || hireJob.compensation || "",
      work_schedule: d.work_schedule || hireJob.work_schedule || "",
      employment_type: d.employment_type || hireJob.employment_type || "full_time",
      work_arrangement: d.work_arrangement || hireJob.work_arrangement || "onsite",
      location: d.location || hireJob.location || "",
      source_url: legacyUrl || hireJob.source_url || "",
      source_type: "text",
      page_description: d.page_description || hireJob.description || "",
      design_description: d.design_description || hireJob.design_description || "",
      email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email') || "",
    });
    const data = res?.data ?? res;
    if (data?.success && data?.job_opening) {
      const newOpening = data.job_opening;
      setJobOpenings(prev => [newOpening, ...prev]);
      setEditingPreviewUrl(legacyUrl || `/careers/${newOpening.public_slug || newOpening.job_id}`);
      setEditingJobOpening(newOpening);
    } else {
      alert(data?.error || "Failed to create job page");
    }
  } catch (err) {
    alert("Failed to create job page: " + (err.message || "unknown error"));
  } finally {
    setLinkingJob(null);
  }
};

const handleDuplicateJob = async (job) => {
  if (!window.confirm(`This will create a copy of "${job.title || 'Untitled'}" including its job details and linked job page. The copy will be saved as a draft with "(Copy)" added to the title. Continue?`)) return;
  setDuplicating(job);
  try {
    const newTitle = `${job.title || "Untitled"} (Copy)`;
    const res = await base44.entities.HireJob.create({
      title: newTitle,
      department: job.department,
      description: job.description,
      responsibilities: job.responsibilities || [],
      required_qualifications: job.required_qualifications || [],
      preferred_qualifications: job.preferred_qualifications || [],
      skills: job.skills || [],
      experience_requirements: job.experience_requirements || "",
      performance_expectations: job.performance_expectations || "",
      compensation: job.compensation || "",
      work_schedule: job.work_schedule || "",
      source_type: job.source_type,
      source_url: job.source_url,
      source_application_position: job.source_application_position,
      role_success_profile: job.role_success_profile,
      role_profile_approved: false,
      scorecard_template: job.scorecard_template || [],
      round1_scorecard: job.round1_scorecard,
      status: "draft",
      created_by_name: localStorage.getItem("sales_member_name") || localStorage.getItem("user_name") || "Admin",
    });
    const newJob = res?.data ?? res;

    const linkedOpening = jobOpenings.find(jo => jo.title === job.title);
    if (linkedOpening) {
      try {
        await base44.functions.invoke("createJobPage", {
          action: "create",
          title: newTitle,
          email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email') || "",
          department: linkedOpening.department || "",
          description: linkedOpening.description_text || "",
          responsibilities: linkedOpening.responsibilities || [],
          required_qualifications: linkedOpening.required_qualifications || [],
          preferred_qualifications: linkedOpening.preferred_qualifications || [],
          skills: linkedOpening.skills || [],
          experience_requirements: linkedOpening.experience_requirements || "",
          compensation: linkedOpening.compensation || "",
          work_schedule: linkedOpening.work_schedule || "",
          employment_type: linkedOpening.employment_type || "full_time",
          work_arrangement: linkedOpening.work_arrangement || "onsite",
          location: linkedOpening.location || "",
          benefits: linkedOpening.benefits || [],
          page_description: linkedOpening.page_description || "",
          design_description: linkedOpening.design_description || "",
          source_type: "text",
          source_url: "",
        });
      } catch (_) {}
    }

    setJobs(prev => [newJob, ...prev]);
    await loadJobs();
  } catch (err) {
    alert("Failed to duplicate job: " + (err.message || "unknown error"));
  } finally {
    setDuplicating(null);
  }
};

const handleDuplicateJobOpening = async (jobOpening) => {
  if (!window.confirm(`This will create a copy of the "${jobOpening.title || 'Untitled'}" job page with all its content. The copy will have "(Copy)" added to the title. Continue?`)) return;
  setDuplicating(jobOpening);
  try {
    const newTitle = `${jobOpening.title || "Untitled"} (Copy)`;
    const res = await base44.functions.invoke("createJobPage", {
      action: "create",
      title: newTitle,
      email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email') || "",
      department: jobOpening.department || "",
      description: jobOpening.description_text || "",
      responsibilities: jobOpening.responsibilities || [],
      required_qualifications: jobOpening.required_qualifications || [],
      preferred_qualifications: jobOpening.preferred_qualifications || [],
      skills: jobOpening.skills || [],
      experience_requirements: jobOpening.experience_requirements || "",
      compensation: jobOpening.compensation || "",
      work_schedule: jobOpening.work_schedule || "",
      employment_type: jobOpening.employment_type || "full_time",
      work_arrangement: jobOpening.work_arrangement || "onsite",
      location: jobOpening.location || "",
      benefits: jobOpening.benefits || [],
      page_description: jobOpening.page_description || "",
      design_description: jobOpening.design_description || "",
      source_type: "text",
      source_url: "",
    });
    const data = res?.data ?? res;
    if (data?.success && data?.job_opening) {
      setJobOpenings(prev => [data.job_opening, ...prev]);
    } else {
      alert(data?.error || "Failed to duplicate job page");
    }
  } catch (err) {
    alert("Failed to duplicate job page: " + (err.message || "unknown error"));
  } finally {
    setDuplicating(null);
  }
};
```

**Imports to add** (at the top of KhethaIQ.jsx, if not already present):
```jsx
import { SALES_JOB_DEFAULTS } from "@/lib/salesJobDefaults";
import { MEDIA_JOB_DEFAULTS } from "@/lib/mediaJobDefaults";
import { MEDIA_JOB_ATLANTA_DEFAULTS } from "@/lib/mediaJobAtlantaDefaults";
```

**Job card button row JSX** (HireJob cards — replace the existing button row inside each job card):

```jsx
<div className="flex items-center gap-2 mt-auto pt-3" style={{ borderTop: "1px solid rgba(184,149,106,0.12)" }}>
  {listingUrl && (
    <button
      onClick={(e) => { e.stopPropagation(); window.open(listingUrl, "_blank"); }}
      className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
      style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
    >
      View Listing
    </button>
  )}
  <button
    onClick={(e) => {
      e.stopPropagation();
      handleEditPage(job);
    }}
    disabled={linkingJob?.id === job.id}
    className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
    style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
  >
    {linkingJob?.id === job.id ? (
      <Loader2 className="w-3 h-3 animate-spin" />
    ) : null}
    Edit Page
  </button>
  <button
    onClick={(e) => { e.stopPropagation(); handleDuplicateJob(job); }}
    disabled={duplicating?.id === job.id}
    className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
    style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
  >
    {duplicating?.id === job.id ? (
      <Loader2 className="w-3 h-3 animate-spin" />
    ) : <Copy className="w-3 h-3" />}
    Duplicate
  </button>
</div>
```

**JobOpening card button row JSX** (JobOpening cards without matching HireJob):

```jsx
<div className="flex items-center gap-2 mt-auto pt-3" style={{ borderTop: "1px solid rgba(184,149,106,0.12)" }}>
  <button
    onClick={(e) => {
      e.stopPropagation();
      const jp = normalizeSourcePath(job.source_url);
      setEditingPreviewUrl(jp || `/careers/${job.public_slug || job.job_id}`);
      setEditingJobOpening(job);
    }}
    className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
    style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
  >
    Edit Page
  </button>
  <button
    onClick={(e) => { e.stopPropagation(); handleDuplicateJobOpening(job); }}
    disabled={duplicating?.id === job.id}
    className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
    style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
  >
    {duplicating?.id === job.id ? (
      <Loader2 className="w-3 h-3 animate-spin" />
    ) : <Copy className="w-3 h-3" />}
    Duplicate
  </button>
</div>
```

**Also update `loadJobs`** to also load JobOpenings (add this inside the existing loadJobs function, after loading HireJobs):

```jsx
try {
  const res = await base44.entities.JobOpening.list("-published_at", 100);
  const list = res?.data ?? res;
  setJobOpenings(Array.isArray(list) ? list : []);
} catch (_) {}
```

---

### Backend Functions

These modals call two existing backend functions — no new backend functions are needed:

1. **`createJobPage`** — accepts `action: "analyze" | "create" | "update"` with job page fields. Returns `{ success, job_opening, public_url }` for create, or `{ extracted }` for analyze.

2. **`manageCareersHubSettings`** — accepts `action: "get" | "save"` with a settings object. Returns `{ settings }` for get.

---

### Summary Checklist

- [ ] Top bar: "Create Job Page" (dark bg, Plus icon) + "Careers Hub" (white bg, Globe icon) buttons, left of "Request New Hire"
- [ ] JobPageBuilder.jsx: 3-step wizard — describe+source tabs (Text/URL/File) → review extracted fields → success with copyable URL
- [ ] EditJobPageModal.jsx: page_description, design_description, all job fields, status/visibility, sticky header+footer with Preview/Cancel/Save
- [ ] CareersHubSettings.jsx: enable toggle, URL slug, company description, hero image, culture, benefits chips, location chips, social links grid
- [ ] Job card buttons: View Listing (if URL), Edit Page, Duplicate — all gold-tinted `rgba(184,149,106,0.15)`, text-xs, rounded-lg
- [ ] handleDuplicateJob: confirm dialog, "(Copy)" suffix, status "draft", linked JobOpening also duplicated
- [ ] handleEditPage: links HireJob to JobOpening via source_url, backfills missing source_url, opens EditJobPageModal
- [ ] loadJobs also loads JobOpenings (`base44.entities.JobOpening.list("-published_at", 100)`)