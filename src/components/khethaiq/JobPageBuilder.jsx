import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Globe, X, Sparkles, FileText, Link as LinkIcon, Upload, Loader2, Check, ArrowLeft, Copy } from "lucide-react";

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