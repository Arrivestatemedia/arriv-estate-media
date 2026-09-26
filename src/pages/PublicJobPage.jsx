import React, { useState, useEffect } from "react";
import { PUBLIC_JOB_PAGE_FAQS as DEFAULT_FAQ } from "@/lib/jobFaqDefaults";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  ArrowRight, Star, MapPin, Clock, Wallet, Briefcase, GripVertical, X,
  Loader2, CheckCircle2, Target, ChevronDown, Heart,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import BackToMainSiteButton from "@/components/BackToMainSiteButton";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const CREAM = "#FFFBF5";
const MUTED = "rgba(26,26,26,0.65)";

const DEFAULT_SECTION_ORDER = [
  "about", "responsibilities", "qualifications", "preferred",
  "experience", "performance", "skills", "compensation", "benefits",
];

const SECTION_LABELS = {
  about: "About the Role",
  responsibilities: "What You'll Do",
  qualifications: "Qualifications",
  preferred: "Preferred Experience",
  experience: "Experience",
  performance: "What We Expect",
  skills: "Key Skills",
  compensation: "Compensation",
  benefits: "Why Join Arriv",
};

const DEFAULT_TRUST = [
  "Independent Contractor",
  "Flexible Schedule",
  "No Monthly Fees",
  "Keep Your Existing Clients",
];



function Section({ eyebrow, title, children, id }) {
  return (
    <section id={id} className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 py-12 sm:py-16">
      {eyebrow && (
        <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-3" style={{ color: GOLD }}>
          {eyebrow}
        </p>
      )}
      {title && (
        <h2 className="text-2xl sm:text-3xl font-bold mb-6" style={{ color: TEXT_DARK }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-4 text-left px-5 py-4">
        <span className="text-sm sm:text-base font-semibold" style={{ color: TEXT_DARK }}>{q}</span>
        <ChevronDown className="w-5 h-5 flex-shrink-0 transition-transform" style={{ color: GOLD, transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <p className="px-5 pb-5 text-sm leading-relaxed" style={{ color: "rgba(26,26,26,0.7)" }}>{a}</p>
      )}
    </div>
  );
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
  const [canEdit, setCanEdit] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [sectionOrderState, setSectionOrderState] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);

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
          const dc = d?.job?.design_spec;
          setSectionOrderState(
            (dc?.section_order && dc.section_order.length > 0)
              ? dc.section_order
              : DEFAULT_SECTION_ORDER
          );
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

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (isAuth) {
          const me = await base44.auth.me();
          if (me && me.role === "admin") { setCanEdit(true); return; }
        }
      } catch {}
      const salesRole = localStorage.getItem('sales_member_role') || sessionStorage.getItem('sales_member_role');
      if (salesRole === "admin") setCanEdit(true);
    };
    checkAuth();
  }, []);

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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: CREAM }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: CREAM }}>
        <div className="text-center">
          <Briefcase className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="text-lg font-medium" style={{ color: TEXT_DARK }}>{error}</p>
          <Link to="/careers" className="inline-flex items-center gap-1 mt-4 text-sm hover:underline" style={{ color: GOLD }}>
            Back to Careers
          </Link>
        </div>
      </div>
    );
  }

  const job = data?.job || {};
  const title = job.title || "Untitled";
  const subtitle = job.page_description || job.description_text || "";
  const heroBadgeText = job.hero_badge || "Now Hiring";
  const preferredItems = job.preferred_qualifications || [];
  const skillsItems = job.skills || [];
  const faqs = job.faqs || [];

  // Hero meta badges
  const heroBadges = [];
  if (job.location) heroBadges.push({ icon: MapPin, label: job.location });
  if (job.employment_type) heroBadges.push({ icon: Briefcase, label: job.employment_type.replace(/_/g, " ") });
  if (job.work_arrangement) heroBadges.push({ icon: MapPin, label: job.work_arrangement });
  if (job.compensation) heroBadges.push({ icon: Wallet, label: job.compensation });
  if (job.work_schedule) heroBadges.push({ icon: Clock, label: job.work_schedule });

  // Build sections matching the SalesGrowthAdvisor page format
  const sections = {
    about: (job.description_text || job.page_description) && (
      <Section key="about" eyebrow="About Arriv Estate Media" id="about">
        <p className="text-lg leading-relaxed max-w-3xl" style={{ color: "rgba(26,26,26,0.78)" }}>
          {job.description_text || job.page_description}
        </p>
        {job.page_description && job.description_text && job.page_description !== job.description_text && (
          <div className="mt-8 rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}>
            <p className="text-base sm:text-lg leading-relaxed" style={{ color: TEXT_DARK }}>
              {job.page_description}
            </p>
          </div>
        )}
        {job.location && (
          <div className="mt-8 rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.25)" }}>
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
              <div>
                <h3 className="font-semibold" style={{ color: TEXT_DARK }}>Now hiring in {job.location}</h3>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>
                  We're currently expanding our network as we prepare to launch in {job.location}. Join early and grow with us.
                </p>
              </div>
            </div>
          </div>
        )}
      </Section>
    ),
    responsibilities: job.responsibilities?.length > 0 && (
      <Section key="responsibilities" eyebrow="Responsibilities" title="What you'll do">
        <div className="grid sm:grid-cols-2 gap-3">
          {job.responsibilities.map((r, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl p-5" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>
                <Target className="w-5 h-5" style={{ color: GOLD }} />
              </span>
              <span className="text-sm font-medium" style={{ color: TEXT_DARK }}>{r}</span>
            </div>
          ))}
        </div>
      </Section>
    ),
    qualifications: job.required_qualifications?.length > 0 && (
      <Section key="qualifications" eyebrow="Qualifications" title="What we're looking for">
        <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3">
          {job.required_qualifications.map((q, i) => (
            <div key={i} className="flex items-start gap-2.5 py-1">
              <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
              <span className="text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>{q}</span>
            </div>
          ))}
        </div>
      </Section>
    ),
    preferred: preferredItems.length > 0 && (
      <Section key="preferred" eyebrow="Nice to Have" title="Preferred qualifications">
        <div className="space-y-2">
          {preferredItems.map((p, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <Star className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
              <span className="text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>{p}</span>
            </div>
          ))}
        </div>
      </Section>
    ),
    experience: job.experience_requirements && (
      <Section key="experience" eyebrow="Experience" title="Experience requirements">
        <p className="text-base leading-relaxed max-w-3xl" style={{ color: "rgba(26,26,26,0.78)" }}>{job.experience_requirements}</p>
      </Section>
    ),
    performance: job.performance_expectations?.length > 0 && (
      <Section key="performance" eyebrow="What We Expect" title="Performance expectations">
        <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3">
          {job.performance_expectations.map((p, i) => (
            <div key={i} className="flex items-start gap-2.5 py-1">
              <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
              <span className="text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>{p}</span>
            </div>
          ))}
        </div>
      </Section>
    ),
    skills: skillsItems.length > 0 && (
      <Section key="skills" eyebrow="Skills" title="Key skills">
        <div className="flex flex-wrap gap-2">
          {skillsItems.map((s, i) => (
            <span key={i} className="px-3 py-1.5 rounded-full text-sm font-medium" style={{ backgroundColor: "rgba(184,149,106,0.12)", color: TEXT_DARK, border: "1px solid rgba(184,149,106,0.3)" }}>
              {s}
            </span>
          ))}
        </div>
      </Section>
    ),
    compensation: (job.compensation || job.work_schedule || job.employment_type) && (
      <Section key="compensation" eyebrow="Compensation" title="Uncapped earning potential">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <Clock className="w-5 h-5 mb-3" style={{ color: GOLD }} />
            <h3 className="font-semibold" style={{ color: TEXT_DARK }}>
              {job.employment_type ? job.employment_type.replace(/_/g, " ") : "Independent Contractor"}
            </h3>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              {job.work_schedule || "Flexible schedule"}.
            </p>
          </div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <Wallet className="w-5 h-5 mb-3" style={{ color: GOLD }} />
            <h3 className="font-semibold" style={{ color: TEXT_DARK }}>{job.compensation || "Get Paid Per Project"}</h3>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              Transparent per-project payouts based on the services requested.
            </p>
          </div>
        </div>
      </Section>
    ),
    benefits: job.benefits?.length > 0 && (
      <Section key="benefits" eyebrow="Why Join Arriv?" title="Be part of the founding team">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {job.benefits.map((b, i) => (
            <div key={i} className="rounded-2xl p-6 h-full" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
              <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: "#1A1A1A" }}>
                <Heart className="w-5 h-5" style={{ color: GOLD }} />
              </span>
              <h3 className="font-semibold" style={{ color: TEXT_DARK }}>{b}</h3>
            </div>
          ))}
        </div>
      </Section>
    ),
  };

  const saveSectionOrder = async (newOrder) => {
    setSavingOrder(true);
    try {
      const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id') || "";
      const salesEmail = localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email') || "";
      const existingSpec = data?.job?.design_spec || {};
      const mergedSpec = { ...existingSpec, section_order: newOrder };
      const res = await base44.functions.invoke("createJobPage", {
        action: "update",
        job_opening_id: data.job.id,
        email: salesEmail,
        sales_member_id: salesMemberId,
        design_spec: mergedSpec,
      });
      const resData = res?.data ?? res;
      if (resData?.success) {
        setData((prev) => ({ ...prev, job: { ...prev.job, design_spec: mergedSpec } }));
      }
    } catch (err) {
      alert("Failed to save layout: " + (err.message || "unknown error"));
    } finally {
      setSavingOrder(false);
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(sectionOrderState);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setSectionOrderState(reordered);
    saveSectionOrder(reordered);
  };

  const visibleSections = (sectionOrderState || DEFAULT_SECTION_ORDER).filter((key) => sections[key]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: CREAM, color: TEXT_DARK }}>
      {/* Edit bar for authenticated admins */}
      {canEdit && (
        <div className="sticky top-0 z-50 bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2 text-sm font-medium">
            <GripVertical className="w-4 h-4" />
            {editMode ? "Drag sections to reorder — changes save automatically" : "You can customize this page layout"}
          </div>
          <div className="flex items-center gap-2">
            {savingOrder && <Loader2 className="w-4 h-4 animate-spin text-white/60" />}
            <button
              onClick={() => setEditMode(!editMode)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: editMode ? "rgba(255,255,255,0.15)" : "#2563EB" }}
            >
              {editMode ? <><X className="w-3.5 h-3.5" /> Exit Editing</> : <><GripVertical className="w-3.5 h-3.5" /> Edit Layout</>}
            </button>
          </div>
        </div>
      )}

      {/* Hero — dark with gold accents, matching SalesGrowthAdvisor */}
      <header className="px-5 sm:px-6 lg:px-8 pt-16 pb-14 sm:pt-20 sm:pb-20" style={{ backgroundColor: "#1A1A1A", color: CREAM }}>
        <div className="max-w-5xl mx-auto">
          <BackToMainSiteButton />
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6" style={{ backgroundColor: "rgba(184,149,106,0.15)", border: "1px solid rgba(184,149,106,0.4)" }}>
            <Star className="w-3.5 h-3.5" style={{ color: GOLD }} />
            <span className="text-xs font-semibold tracking-wide" style={{ color: GOLD }}>{heroBadgeText}</span>
          </div>
          <div className="flex items-center gap-2 mb-6">
            <Briefcase className="w-4 h-4" style={{ color: GOLD }} />
            <span className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: GOLD }}>Careers</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight max-w-3xl">{title}</h1>
          {subtitle && (
            <p className="mt-5 text-base sm:text-lg max-w-2xl" style={{ color: "rgba(255,251,245,0.78)" }}>{subtitle}</p>
          )}
          {heroBadges.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: "rgba(255,251,245,0.7)" }}>
              {heroBadges.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <b.icon className="w-4 h-4" style={{ color: GOLD }} /> {b.label}
                </span>
              ))}
            </div>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button onClick={handleApplyClick} className="rounded-lg font-semibold" style={{ backgroundColor: GOLD, color: TEXT_DARK }}>
              Apply Now <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            {visibleSections.length > 0 && (
              <a href="#about" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors" style={{ color: CREAM, border: "1px solid rgba(184,149,106,0.4)" }}>
                Learn more
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Trust badges */}
      <div style={{ backgroundColor: "#1A1A1A", color: CREAM }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 pb-10 -mt-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {DEFAULT_TRUST.map((t) => (
              <div key={t} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: GOLD }} />
                <span className="text-sm font-medium" style={{ color: "rgba(255,251,245,0.9)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content sections */}
      {editMode ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="sections">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {visibleSections.map((key, index) => (
                  <Draggable key={key} draggableId={key} index={index}>
                    {(prov, snapshot) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.draggableProps}
                        className={`relative group ${snapshot.isDragging ? "ring-2 ring-blue-500 shadow-2xl z-50" : "border-2 border-dashed border-transparent hover:border-blue-300"} transition-all`}
                      >
                        <div
                          {...prov.dragHandleProps}
                          className="absolute left-2 top-3 z-10 cursor-grab active:cursor-grabbing bg-slate-900 text-white rounded-md p-1.5 opacity-60 group-hover:opacity-100"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="absolute top-3 left-12 z-10 bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          {SECTION_LABELS[key] || key}
                        </div>
                        {sections[key]}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        visibleSections.map((key) => sections[key])
      )}

      {/* FAQ */}
      <Section eyebrow="FAQ" title="Frequently asked questions">
        <div className="space-y-3">
          {(faqs.length ? faqs : DEFAULT_FAQ).map((item, i) => (
            <FaqItem key={item.q || i} q={item.q} a={item.a} />
          ))}
        </div>
      </Section>

      {/* CTA — dark with badge, matching SalesGrowthAdvisor */}
      <section style={{ backgroundColor: "#1A1A1A", color: CREAM }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 py-14 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5" style={{ backgroundColor: "rgba(184,149,106,0.15)", border: "1px solid rgba(184,149,106,0.4)" }}>
            <Star className="w-3.5 h-3.5" style={{ color: GOLD }} />
            <span className="text-xs font-semibold tracking-wide" style={{ color: GOLD }}>
              {job.hero_badge ? `${job.hero_badge} — limited spots available` : "Limited spots available"}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to apply?</h2>
          <p className="mt-3 text-sm sm:text-base" style={{ color: "rgba(255,251,245,0.7)" }}>
            Take the next step and join our team.
          </p>
          <div className="mt-7">
            <Button onClick={handleApplyClick} size="lg" className="rounded-lg font-semibold" style={{ backgroundColor: GOLD, color: TEXT_DARK }}>
              Apply Now <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}