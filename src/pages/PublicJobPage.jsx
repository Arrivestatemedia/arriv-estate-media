import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Check, Star, Heart, MapPin, Briefcase, Clock, DollarSign, Loader2 } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.6)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

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

export default function PublicJobPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const attr = captureAttribution();
        const res = await base44.functions.invoke("getPublicJobPage", {
          slug: jobId,
          host: window.location.hostname,
          ...attr,
        });
        const d = res?.data ?? res;
        if (d?.error) {
          setError(d.error);
        } else {
          setData(d);
          if (d.job) {
            document.title = `${d.job.title} at ${d.tenant?.company_name || "Arriv Estate Media"}`;
          }
        }
      } catch (err) {
        setError(err.message || "Failed to load job page");
      }
      setLoading(false);
    })();
    return () => { document.title = "Arriv Estate Media"; };
  }, [jobId]);

  const handleApplyClick = () => {
    const attr = captureAttribution();
    base44.functions.invoke("trackJobPageEvent", {
      job_id: data?.job?.job_id,
      event_type: "apply_click",
      ...attr,
    }).catch(() => {});
    navigate(`/careers/${jobId}/apply${window.location.search}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FFFBF5" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FFFBF5" }}>
        <div className="text-center">
          <Briefcase className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="text-lg font-medium" style={{ color: TEXT_DARK }}>{error}</p>
          <Link to="/careers" className="inline-flex items-center gap-1 mt-4 text-sm hover:underline" style={{ color: GOLD }}>
            <ArrowLeft className="w-4 h-4" /> Back to Careers
          </Link>
        </div>
      </div>
    );
  }

  const job = data?.job || {};
  const tenant = data?.tenant || {};
  const primary = tenant.primary_color || GOLD;
  const hubSlug = tenant.career_company_slug || "arriv-estate-media";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFFBF5" }}>
      {/* Hero */}
      <div className="relative" style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <Link to={`/careers/company/${hubSlug}`} className="inline-flex items-center gap-1.5 text-sm mb-6 hover:opacity-70" style={{ color: "rgba(255,251,245,0.6)" }}>
            <ArrowLeft className="w-4 h-4" /> All Careers
          </Link>
          {tenant.logo_url && <img src={tenant.logo_url} alt={tenant.company_name} className="h-10 mb-4" />}
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-3" style={{ backgroundColor: `${primary}30`, color: primary }}>
            Now Hiring
          </div>
          <h1 className="text-4xl font-bold mb-2" style={{ ...SERIF }}>{job.title}</h1>
          {job.department && <p className="text-lg mb-4" style={{ color: "rgba(255,251,245,0.6)" }}>{job.department}</p>}
          <div className="flex items-center gap-4 flex-wrap text-sm" style={{ color: "rgba(255,251,245,0.7)" }}>
            {job.location && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {job.location}</span>}
            {job.employment_type && <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {job.employment_type.replace(/_/g, " ")}</span>}
            {job.work_arrangement && <span className="capitalize">{job.work_arrangement}</span>}
            {job.compensation && <span className="flex items-center gap-1"><DollarSign className="w-4 h-4" /> {job.compensation}</span>}
            {job.work_schedule && <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {job.work_schedule}</span>}
          </div>
          <button onClick={handleApplyClick} className="mt-6 px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-90" style={{ backgroundColor: primary, color: "#1A1A1A" }}>
            Apply Now
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
        {(job.page_description || job.description_text) && (
          <section>
            <h2 className="text-2xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>About the Role</h2>
            <p className="whitespace-pre-wrap text-base leading-relaxed" style={{ color: MUTED }}>{job.page_description || job.description_text}</p>
          </section>
        )}

        {job.responsibilities?.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>What You'll Do</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {job.responsibilities.map((r, i) => (
                <div key={i} className="p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.15)" }}>
                  <Check className="w-5 h-5 shrink-0 mt-0.5" style={{ color: primary }} />
                  <span className="text-sm" style={{ color: TEXT_DARK }}>{r}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {job.required_qualifications?.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>What We're Looking For</h2>
            <div className="space-y-2">
              {job.required_qualifications.map((q, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Check className="w-5 h-5 shrink-0 mt-0.5" style={{ color: primary }} />
                  <span className="text-sm" style={{ color: TEXT_DARK }}>{q}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {job.preferred_qualifications?.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>Nice to Have</h2>
            <div className="space-y-2">
              {job.preferred_qualifications.map((q, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Star className="w-5 h-5 shrink-0 mt-0.5" style={{ color: primary }} />
                  <span className="text-sm" style={{ color: TEXT_DARK }}>{q}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {job.skills?.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>Key Skills</h2>
            <div className="flex flex-wrap gap-2">
              {job.skills.map((s, i) => (
                <span key={i} className="px-3 py-1.5 rounded-full text-sm font-medium" style={{ backgroundColor: `${primary}15`, color: TEXT_DARK, border: `1px solid ${primary}30` }}>
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {job.benefits?.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>Benefits</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {job.benefits.map((b, i) => (
                <div key={i} className="p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.15)" }}>
                  <Heart className="w-5 h-5 shrink-0 mt-0.5" style={{ color: primary }} />
                  <span className="text-sm" style={{ color: TEXT_DARK }}>{b}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {(job.compensation || job.work_schedule || job.travel_requirements) && (
          <section className="p-6 rounded-xl" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.15)" }}>
            <h2 className="text-xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>Compensation & Schedule</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {job.compensation && <div><p style={{ color: MUTED }}>Compensation</p><p className="font-medium mt-1" style={{ color: TEXT_DARK }}>{job.compensation}</p></div>}
              {job.work_schedule && <div><p style={{ color: MUTED }}>Work Schedule</p><p className="font-medium mt-1" style={{ color: TEXT_DARK }}>{job.work_schedule}</p></div>}
              {job.travel_requirements && <div><p style={{ color: MUTED }}>Travel</p><p className="font-medium mt-1" style={{ color: TEXT_DARK }}>{job.travel_requirements}</p></div>}
            </div>
          </section>
        )}
      </div>

      <div className="py-12 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <h2 className="text-2xl font-bold mb-4" style={{ ...SERIF, color: "#FFFBF5" }}>Ready to apply?</h2>
        <button onClick={handleApplyClick} className="px-8 py-3 rounded-lg font-semibold transition-all hover:opacity-90" style={{ backgroundColor: primary, color: "#1A1A1A" }}>
          Apply Now
        </button>
      </div>

      <footer className="py-8 text-center" style={{ borderTop: "1px solid rgba(184,149,106,0.15)" }}>
        <p className="text-sm" style={{ color: MUTED }}>Hiring powered by Khetha IQ</p>
      </footer>
    </div>
  );
}