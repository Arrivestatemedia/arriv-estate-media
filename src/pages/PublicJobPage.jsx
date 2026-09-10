import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Check, Star, Heart, MapPin, Briefcase, Clock, DollarSign, Loader2 } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.6)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };
const SANS = { fontFamily: "Inter, system-ui, sans-serif" };
const MONO = { fontFamily: "'Courier New', monospace" };

const DEFAULT_SPEC = {
  hero_style: "full_bleed",
  primary_color: null,
  secondary_color: null,
  accent_color: null,
  background_tone: "light",
  section_order: ["about", "responsibilities", "qualifications", "preferred", "experience", "performance", "skills", "benefits", "compensation"],
  layout_density: "spacious",
  tone: "classic",
  font_family: null,
  heading_font_family: null,
  hero_image_url: null,
  button_style: "rounded",
  card_style: "bordered",
  content_width: "standard",
  show_logo: true,
  show_badge: true,
};

function resolveSpec(spec) {
  if (!spec || typeof spec !== "object") return DEFAULT_SPEC;
  const specOrder = Array.isArray(spec.section_order) && spec.section_order.length > 0
    ? spec.section_order
    : DEFAULT_SPEC.section_order;
  // Merge: ensure all default keys are present (handles old specs missing new keys)
  const defaultKeys = DEFAULT_SPEC.section_order;
  const merged = [...specOrder, ...defaultKeys.filter(k => !specOrder.includes(k))];
  return {
    ...DEFAULT_SPEC,
    ...spec,
    section_order: merged,
  };
}

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
  const spec = resolveSpec(job.design_spec);

  // Resolve colors
  const primary = spec.primary_color || tenant.primary_color || GOLD;
  const accent = spec.accent_color || primary;
  const heroBg = spec.secondary_color || "#1A1A1A";

  // Resolve background tone
  const pageBg = spec.background_tone === "dark" ? "#0F0F0F" : spec.background_tone === "warm" ? "#F5EDE0" : "#FFFBF5";
  const pageText = spec.background_tone === "dark" ? "#FFFBF5" : TEXT_DARK;
  const pageMuted = spec.background_tone === "dark" ? "rgba(255,251,245,0.6)" : MUTED;
  const cardBg = spec.background_tone === "dark" ? "#1A1A1A" : "#FFFFFF";
  const cardBorder = spec.background_tone === "dark" ? "rgba(255,255,255,0.1)" : "rgba(184,149,106,0.15)";

  // Resolve density
  const sectionPy = spec.layout_density === "compact" ? "py-8" : "py-12";

  // Resolve fonts
  const bodyFont = spec.font_family === "mono" ? MONO : spec.font_family === "sans" ? SANS : spec.font_family === "serif" ? SERIF : {};
  const headingFont = spec.heading_font_family
    ? (spec.heading_font_family === "mono" ? MONO : spec.heading_font_family === "sans" ? SANS : SERIF)
    : (spec.tone === "modern" || spec.tone === "professional") ? SANS : SERIF;

  // Resolve button style
  const btnRadius = spec.button_style === "pill" ? "9999px" : spec.button_style === "square" ? "0px" : "8px";
  const btnStyle = spec.button_style === "ghost"
    ? { backgroundColor: "transparent", color: primary, border: `2px solid ${primary}`, borderRadius: btnRadius }
    : { backgroundColor: primary, color: "#1A1A1A", border: "none", borderRadius: btnRadius };

  // Resolve card style
  const cardStyleObj = spec.card_style === "flat"
    ? { backgroundColor: "transparent", border: "none" }
    : spec.card_style === "tinted"
    ? { backgroundColor: `${primary}08`, border: `1px solid ${primary}20` }
    : spec.card_style === "elevated"
    ? { backgroundColor: cardBg, border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }
    : { backgroundColor: cardBg, border: `1px solid ${cardBorder}` };

  // Resolve content width
  const contentMaxWidth = spec.content_width === "narrow" ? "max-w-2xl" : spec.content_width === "wide" ? "max-w-6xl" : "max-w-4xl";

  // Resolve visibility & hero image
  const showLogo = spec.show_logo !== false;
  const showBadge = spec.show_badge !== false;
  const heroImage = spec.hero_image_url || tenant.career_hero_image || "";

  const hubSlug = tenant.career_company_slug || "arriv-estate-media";

  // Info row items (reused across hero styles)
  const infoItems = (
    <>
      {job.location && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {job.location}</span>}
      {job.employment_type && <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {job.employment_type.replace(/_/g, " ")}</span>}
      {job.work_arrangement && <span className="capitalize">{job.work_arrangement}</span>}
      {job.compensation && <span className="flex items-center gap-1"><DollarSign className="w-4 h-4" /> {job.compensation}</span>}
      {job.work_schedule && <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {job.work_schedule}</span>}
    </>
  );

  // Hero rendering per style
  const renderHero = () => {
    if (spec.hero_style === "centered") {
      return (
        <div className="text-center" style={{ backgroundColor: heroBg, color: "#FFFBF5" }}>
          <div className="max-w-2xl mx-auto px-6 py-20">
            <Link to={`/careers/company/${hubSlug}`} className="inline-flex items-center gap-1.5 text-sm mb-6 hover:opacity-70" style={{ color: "rgba(255,251,245,0.6)" }}>
              <ArrowLeft className="w-4 h-4" /> All Careers
            </Link>
            {showLogo && tenant.logo_url && <img src={tenant.logo_url} alt={tenant.company_name} className="h-10 mx-auto mb-4" />}
            {showBadge && (
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-4" style={{ backgroundColor: `${accent}30`, color: accent }}>
              Now Hiring
            </div>
          )}
            <h1 className="text-4xl font-bold mb-3" style={headingFont}>{job.title}</h1>
            {job.department && <p className="text-lg mb-4" style={{ color: "rgba(255,251,245,0.6)" }}>{job.department}</p>}
            <div className="flex items-center justify-center gap-4 flex-wrap text-sm mb-6" style={{ color: "rgba(255,251,245,0.7)" }}>
              {infoItems}
            </div>
            <button onClick={handleApplyClick} className="px-8 py-3 rounded-lg font-semibold transition-all hover:opacity-90" style={btnStyle}>
              Apply Now
            </button>
          </div>
        </div>
      );
    }

    if (spec.hero_style === "split") {
      return (
        <div className="grid md:grid-cols-2" style={{ backgroundColor: heroBg, color: "#FFFBF5" }}>
          <div className="p-10 md:p-14 flex flex-col justify-center">
            <Link to={`/careers/company/${hubSlug}`} className="inline-flex items-center gap-1.5 text-sm mb-6 hover:opacity-70" style={{ color: "rgba(255,251,245,0.6)" }}>
              <ArrowLeft className="w-4 h-4" /> All Careers
            </Link>
            {showLogo && tenant.logo_url && <img src={tenant.logo_url} alt={tenant.company_name} className="h-10 mb-4" />}
            {showBadge && (
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-3 w-fit" style={{ backgroundColor: `${accent}30`, color: accent }}>
              Now Hiring
            </div>
          )}
            <h1 className="text-3xl md:text-4xl font-bold mb-2" style={headingFont}>{job.title}</h1>
            {job.department && <p className="text-lg mb-3" style={{ color: "rgba(255,251,245,0.6)" }}>{job.department}</p>}
            {job.page_description && <p className="text-sm leading-relaxed" style={{ color: "rgba(255,251,245,0.7)" }}>{job.page_description}</p>}
          </div>
          <div className="p-8 md:p-10 flex flex-col justify-center" style={{ backgroundColor: "rgba(255,255,255,0.04)", ...(heroImage ? { backgroundImage: `url(${heroImage})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) }}>
            <div className="space-y-3 text-sm" style={{ color: "rgba(255,251,245,0.8)" }}>
              {job.location && <div className="flex items-center gap-2"><MapPin className="w-4 h-4" style={{ color: accent }} /> {job.location}</div>}
              {job.employment_type && <div className="flex items-center gap-2"><Briefcase className="w-4 h-4" style={{ color: accent }} /> {job.employment_type.replace(/_/g, " ")}</div>}
              {job.work_arrangement && <div className="flex items-center gap-2 capitalize"><Check className="w-4 h-4" style={{ color: accent }} /> {job.work_arrangement}</div>}
              {job.compensation && <div className="flex items-center gap-2"><DollarSign className="w-4 h-4" style={{ color: accent }} /> {job.compensation}</div>}
              {job.work_schedule && <div className="flex items-center gap-2"><Clock className="w-4 h-4" style={{ color: accent }} /> {job.work_schedule}</div>}
            </div>
            <button onClick={handleApplyClick} className="mt-6 px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-90" style={btnStyle}>
              Apply Now
            </button>
          </div>
        </div>
      );
    }

    if (spec.hero_style === "minimal") {
      return (
        <div style={{ backgroundColor: pageBg, color: pageText }}>
          <div className="max-w-4xl mx-auto px-6 py-10">
            <Link to={`/careers/company/${hubSlug}`} className="inline-flex items-center gap-1.5 text-sm mb-6 hover:opacity-70" style={{ color: pageMuted }}>
              <ArrowLeft className="w-4 h-4" /> All Careers
            </Link>
            {showLogo && tenant.logo_url && <img src={tenant.logo_url} alt={tenant.company_name} className="h-9 mb-3" />}
            {showBadge && (
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-3" style={{ backgroundColor: `${accent}20`, color: accent }}>
              Now Hiring
            </div>
          )}
            <h1 className="text-3xl font-bold mb-1" style={headingFont}>{job.title}</h1>
            {job.department && <p className="text-base mb-3" style={{ color: pageMuted }}>{job.department}</p>}
            <div className="flex items-center gap-4 flex-wrap text-sm mb-5" style={{ color: pageMuted }}>
              {infoItems}
            </div>
            <button onClick={handleApplyClick} className="px-6 py-2.5 rounded-lg font-semibold transition-all hover:opacity-90" style={btnStyle}>
              Apply Now
            </button>
          </div>
        </div>
      );
    }

    // full_bleed (default)
    return (
      <div className="relative" style={{ backgroundColor: heroBg, color: "#FFFBF5" }}>
        {heroImage && (
          <div className="absolute inset-0" style={{ backgroundImage: `url(${tenant.career_hero_image})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.2 }} />
        )}
        <div className="relative max-w-4xl mx-auto px-6 py-14">
          <Link to={`/careers/company/${hubSlug}`} className="inline-flex items-center gap-1.5 text-sm mb-6 hover:opacity-70" style={{ color: "rgba(255,251,245,0.6)" }}>
            <ArrowLeft className="w-4 h-4" /> All Careers
          </Link>
          {showLogo && tenant.logo_url && <img src={tenant.logo_url} alt={tenant.company_name} className="h-10 mb-4" />}
          {showBadge && (
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-3" style={{ backgroundColor: `${accent}30`, color: accent }}>
            Now Hiring
          </div>
        )}
          <h1 className="text-4xl font-bold mb-2" style={headingFont}>{job.title}</h1>
          {job.department && <p className="text-lg mb-4" style={{ color: "rgba(255,251,245,0.6)" }}>{job.department}</p>}
          <div className="flex items-center gap-4 flex-wrap text-sm mb-5" style={{ color: "rgba(255,251,245,0.7)" }}>
            {infoItems}
          </div>
          <button onClick={handleApplyClick} className="px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-90" style={btnStyle}>
            Apply Now
          </button>
        </div>
      </div>
    );
  };

  // Build sections map
  const sections = {
    about: (job.page_description || job.description_text) && (
      <section key="about">
        <h2 className="text-2xl font-bold mb-4" style={{ ...headingFont, color: pageText }}>About the Role</h2>
        <p className="whitespace-pre-wrap text-base leading-relaxed" style={{ color: pageMuted }}>{job.page_description || job.description_text}</p>
      </section>
    ),
    responsibilities: job.responsibilities?.length > 0 && (
      <section key="responsibilities">
        <h2 className="text-2xl font-bold mb-4" style={{ ...headingFont, color: pageText }}>What You'll Do</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {job.responsibilities.map((r, i) => (
            <div key={i} className="p-4 rounded-xl flex items-start gap-3" style={cardStyleObj}>
              <Check className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent }} />
              <span className="text-sm" style={{ color: pageText }}>{r}</span>
            </div>
          ))}
        </div>
      </section>
    ),
    qualifications: job.required_qualifications?.length > 0 && (
      <section key="qualifications">
        <h2 className="text-2xl font-bold mb-4" style={{ ...headingFont, color: pageText }}>What We're Looking For</h2>
        <div className="space-y-2">
          {job.required_qualifications.map((q, i) => (
            <div key={i} className="flex items-start gap-3">
              <Check className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent }} />
              <span className="text-sm" style={{ color: pageText }}>{q}</span>
            </div>
          ))}
        </div>
      </section>
    ),
    preferred: job.preferred_qualifications?.length > 0 && (
      <section key="preferred">
        <h2 className="text-2xl font-bold mb-4" style={{ ...headingFont, color: pageText }}>Nice to Have</h2>
        <div className="space-y-2">
          {job.preferred_qualifications.map((q, i) => (
            <div key={i} className="flex items-start gap-3">
              <Star className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent }} />
              <span className="text-sm" style={{ color: pageText }}>{q}</span>
            </div>
          ))}
        </div>
      </section>
    ),
    skills: job.skills?.length > 0 && (
      <section key="skills">
        <h2 className="text-2xl font-bold mb-4" style={{ ...headingFont, color: pageText }}>Key Skills</h2>
        <div className="flex flex-wrap gap-2">
          {job.skills.map((s, i) => (
            <span key={i} className="px-3 py-1.5 rounded-full text-sm font-medium" style={{ backgroundColor: `${primary}15`, color: pageText, border: `1px solid ${primary}30` }}>
              {s}
            </span>
          ))}
        </div>
      </section>
    ),
    benefits: job.benefits?.length > 0 && (
      <section key="benefits">
        <h2 className="text-2xl font-bold mb-4" style={{ ...headingFont, color: pageText }}>Benefits</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {job.benefits.map((b, i) => (
            <div key={i} className="p-4 rounded-xl flex items-start gap-3" style={cardStyleObj}>
              <Heart className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent }} />
              <span className="text-sm" style={{ color: pageText }}>{b}</span>
            </div>
          ))}
        </div>
      </section>
    ),
    experience: job.experience_requirements && (
      <section key="experience">
        <h2 className="text-2xl font-bold mb-4" style={{ ...headingFont, color: pageText }}>Experience</h2>
        <p className="text-base leading-relaxed" style={{ color: pageMuted }}>{job.experience_requirements}</p>
      </section>
    ),
    performance: job.performance_expectations?.length > 0 && (
      <section key="performance">
        <h2 className="text-2xl font-bold mb-4" style={{ ...headingFont, color: pageText }}>What We Expect</h2>
        <div className="space-y-2">
          {job.performance_expectations.map((p, i) => (
            <div key={i} className="flex items-start gap-3">
              <Check className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent }} />
              <span className="text-sm" style={{ color: pageText }}>{p}</span>
            </div>
          ))}
        </div>
      </section>
    ),
    compensation: (job.compensation || job.work_schedule || job.travel_requirements) && (
      <section key="compensation" className="p-6 rounded-xl" style={cardStyleObj}>
        <h2 className="text-xl font-bold mb-4" style={{ ...headingFont, color: pageText }}>Compensation & Schedule</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {job.compensation && <div><p style={{ color: pageMuted }}>Compensation</p><p className="font-medium mt-1" style={{ color: pageText }}>{job.compensation}</p></div>}
          {job.work_schedule && <div><p style={{ color: pageMuted }}>Work Schedule</p><p className="font-medium mt-1" style={{ color: pageText }}>{job.work_schedule}</p></div>}
          {job.travel_requirements && <div><p style={{ color: pageMuted }}>Travel</p><p className="font-medium mt-1" style={{ color: pageText }}>{job.travel_requirements}</p></div>}
        </div>
      </section>
    ),
  };

  // Render sections in spec order, skipping falsy
  const renderedSections = spec.section_order
    .map(key => sections[key])
    .filter(Boolean);

  return (
    <div className="min-h-screen" style={{ backgroundColor: pageBg, color: pageText, ...bodyFont }}>
      {renderHero()}

      <div className={`${contentMaxWidth} mx-auto px-6 ${sectionPy} space-y-10`}>
        {renderedSections}
      </div>

      <div className="py-12 text-center" style={{ backgroundColor: heroBg }}>
        <h2 className="text-2xl font-bold mb-4" style={{ ...headingFont, color: "#FFFBF5" }}>Ready to apply?</h2>
        <button onClick={handleApplyClick} className="px-8 py-3 rounded-lg font-semibold transition-all hover:opacity-90" style={btnStyle}>
          Apply Now
        </button>
      </div>

      <footer className="py-8 text-center" style={{ borderTop: `1px solid ${cardBorder}` }}>
        <p className="text-sm" style={{ color: pageMuted }}>Hiring powered by Khetha IQ</p>
      </footer>
    </div>
  );
}