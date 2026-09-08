import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Upload, Loader2, Check, FileText, AlertTriangle } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.6)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

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
  marginBottom: "5px",
  display: "block",
};

function getSessionId() {
  let id = sessionStorage.getItem("khetha_session");
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("khetha_session", id);
  }
  return id;
}

function captureAttribution() {
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get("source") || params.get("utm_source") || "",
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    utm_content: params.get("utm_content") || "",
    referrer_url: document.referrer || "",
    landing_page_url: window.location.href.split("#")[0] || "",
    first_touch_at: new Date().toISOString(),
    session_id: getSessionId(),
  };
}

export default function PublicJobApplication() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const [resumeUrl, setResumeUrl] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", address: "", dob: "",
    linkedin: "", portfolio_link: "", last_related_job: "", why_good_fit: "",
    race: "", eeoc_agreed: false, signature: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const attr = captureAttribution();
        base44.functions.invoke("trackJobPageEvent", { job_id: jobId, event_type: "application_started", ...attr }).catch(() => {});

        const res = await base44.functions.invoke("getPublicJobPage", { slug: jobId, host: window.location.hostname, ...attr });
        const d = res?.data ?? res;
        if (d?.error) {
          setError(d.error);
        } else {
          setJob(d.job);
          setTenant(d.tenant);
        }
      } catch (err) {
        setError(err.message || "Failed to load");
      }
      setLoading(false);
    })();
  }, [jobId]);

  const handleResumeUpload = async (file) => {
    setUploading(true);
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const url = uploadRes?.file_url || uploadRes?.data?.file_url;
      setResumeUrl(url);
      setResumeName(file.name);

      setExtracting(true);
      try {
        const extractRes = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url: url,
          json_schema: {
            type: "object",
            properties: {
              fullName: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              address: { type: "string" },
              linkedin: { type: "string" },
              lastRelatedJob: { type: "string" },
            },
          },
        });
        const extracted = extractRes?.output || extractRes?.data?.output;
        if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
          setForm(prev => ({
            ...prev,
            full_name: extracted.fullName || prev.full_name,
            email: extracted.email || prev.email,
            phone: extracted.phone || prev.phone,
            address: extracted.address || prev.address,
            linkedin: extracted.linkedin || prev.linkedin,
            last_related_job: extracted.lastRelatedJob || prev.last_related_job,
          }));
        }
      } catch {}
      setExtracting(false);
    } catch (err) {
      alert("Upload failed: " + (err.message || "unknown error"));
    }
    setUploading(false);
  };

  const canSubmit = form.full_name && form.email && form.phone && form.linkedin &&
    form.last_related_job && form.why_good_fit && form.eeoc_agreed && form.signature && resumeUrl && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const attr = captureAttribution();
      const res = await base44.functions.invoke("submitPublicJobApplication", {
        job_opening_id: job?.job_id,
        ...form,
        email: form.email.toLowerCase(),
        resume_url: resumeUrl,
        ...attr,
        application_started_at: attr.first_touch_at,
      });
      const d = res?.data ?? res;
      if (d?.error) {
        setError(d.error);
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      setError(err.message || "Submission failed");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FFFBF5" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FFFBF5" }}>
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="text-lg font-medium" style={{ color: TEXT_DARK }}>{error}</p>
          <Link to={`/careers/${jobId}`} className="inline-flex items-center gap-1 mt-4 text-sm hover:underline" style={{ color: GOLD }}>
            <ArrowLeft className="w-4 h-4" /> Back to Job
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FFFBF5" }}>
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>
            <Check className="w-8 h-8" style={{ color: GOLD }} />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ ...SERIF, color: TEXT_DARK }}>Application Received</h1>
          <p className="text-sm mb-6" style={{ color: MUTED }}>Thank you for your application. We'll review it and get back to you soon.</p>
          <Link to={`/careers/${jobId}`} className="inline-block px-6 py-3 rounded-lg font-semibold" style={{ backgroundColor: GOLD, color: "#FFFBF5" }}>
            Back to Job Page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFFBF5" }}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <Link to={`/careers/${jobId}`} className="inline-flex items-center gap-1.5 text-sm mb-6 hover:opacity-70" style={{ color: GOLD }}>
          <ArrowLeft className="w-4 h-4" /> Back to Job
        </Link>

        <div className="p-5 rounded-xl mb-5" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.15)" }}>
          <h1 className="text-xl font-bold mb-1" style={{ ...SERIF, color: TEXT_DARK }}>
            {tenant?.company_name || "Arriv Estate Media"} — {job?.title} Application
          </h1>
          <div className="flex items-center gap-3 text-sm" style={{ color: MUTED }}>
            {job?.location && <span>{job.location}</span>}
            {job?.employment_type && <span className="capitalize">{job.employment_type.replace(/_/g, " ")}</span>}
            {job?.work_arrangement && <span className="capitalize">{job.work_arrangement}</span>}
            {job?.compensation && <span>{job.compensation}</span>}
          </div>
        </div>

        <div className="p-4 rounded-xl mb-5 flex items-start gap-3" style={{ backgroundColor: "rgba(184,149,106,0.08)", border: "1px solid rgba(184,149,106,0.2)" }}>
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: GOLD }} />
          <p className="text-sm" style={{ color: TEXT_DARK }}>
            <strong>Important Notice:</strong> This application is not a contract of employment. Submission does not guarantee a position or establishment of an employment relationship.
          </p>
        </div>

        <div className="mb-5">
          <label style={labelStyle}>Resume (Required)</label>
          <label
            className="flex flex-col items-center justify-center gap-2 p-8 rounded-xl cursor-pointer transition-all"
            style={{ border: "2px dashed rgba(184,149,106,0.3)", backgroundColor: "rgba(184,149,106,0.04)" }}
          >
            {uploading || extracting ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
                <span className="text-sm" style={{ color: MUTED }}>{extracting ? "Reading your resume..." : "Uploading..."}</span>
              </>
            ) : resumeUrl ? (
              <>
                <FileText className="w-6 h-6" style={{ color: GOLD }} />
                <span className="text-sm font-medium" style={{ color: TEXT_DARK }}>{resumeName}</span>
                <span className="text-xs" style={{ color: MUTED }}>Click to replace</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6" style={{ color: GOLD }} />
                <span className="text-sm" style={{ color: MUTED }}>Upload PDF, DOC, DOCX, or TXT (max 10MB)</span>
              </>
            )}
            <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f); }} />
          </label>
        </div>

        <div className="p-5 rounded-xl space-y-4 mb-5" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.15)" }}>
          <h2 className="font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Personal Information</h2>

          <div>
            <label style={labelStyle}>Full Name *</label>
            <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
            </div>
            <div>
              <label style={labelStyle}>Phone *</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Address</label>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Date of Birth</label>
              <input type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
            </div>
            <div>
              <label style={labelStyle}>LinkedIn *</label>
              <input value={form.linkedin} onChange={e => setForm({ ...form, linkedin: e.target.value })} placeholder="LinkedIn URL or N/A" style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Portfolio / Website (Optional)</label>
            <input value={form.portfolio_link} onChange={e => setForm({ ...form, portfolio_link: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
          </div>
          <div>
            <label style={labelStyle}>Last Related Job/Experience *</label>
            <textarea value={form.last_related_job} onChange={e => setForm({ ...form, last_related_job: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
          </div>
          <div>
            <label style={labelStyle}>Why Are You a Good Fit? *</label>
            <textarea value={form.why_good_fit} onChange={e => setForm({ ...form, why_good_fit: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
          </div>
          <div>
            <label style={labelStyle}>Race / Ethnicity (Optional)</label>
            <select value={form.race} onChange={e => setForm({ ...form, race: e.target.value })} style={inputStyle}>
              <option value="">Select...</option>
              <option value="white">White</option>
              <option value="black_african_american">Black or African American</option>
              <option value="hispanic_latino">Hispanic or Latino</option>
              <option value="asian">Asian</option>
              <option value="native_american">Native American</option>
              <option value="pacific_islander">Pacific Islander</option>
              <option value="two_or_more">Two or More</option>
              <option value="prefer_not_to_answer">Prefer Not to Answer</option>
            </select>
          </div>
        </div>

        <div className="p-4 rounded-xl mb-5" style={{ backgroundColor: "rgba(184,149,106,0.04)", border: "1px solid rgba(184,149,106,0.15)" }}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={form.eeoc_agreed} onChange={e => setForm({ ...form, eeoc_agreed: e.target.checked })} className="mt-1 w-4 h-4 accent-amber-700" />
            <span className="text-sm" style={{ color: TEXT_DARK }}>
              Equal Employment Opportunity: We are an equal opportunity employer and do not discriminate against any employee or applicant for employment because of race, color, religion, sex, national origin, age, disability, or any other protected characteristic.
            </span>
          </label>
        </div>

        <div className="p-5 rounded-xl space-y-3 mb-5" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.15)" }}>
          <div>
            <label style={labelStyle}>Electronic Signature (Type Full Name) *</label>
            <input value={form.signature} onChange={e => setForm({ ...form, signature: e.target.value })} style={inputStyle} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"} />
          </div>
          <p className="text-xs" style={{ color: MUTED }}>
            By typing your full name above, you are electronically signing this application and certifying that all information provided is true and accurate to the best of your knowledge.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg mb-5 text-sm" style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#DC2626" }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: GOLD, color: "#FFFBF5" }}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
            </span>
          ) : "Submit Application"}
        </button>
      </div>

      <footer className="py-8 text-center" style={{ borderTop: "1px solid rgba(184,149,106,0.15)" }}>
        <p className="text-sm" style={{ color: MUTED }}>Hiring powered by Khetha IQ</p>
      </footer>
    </div>
  );
}