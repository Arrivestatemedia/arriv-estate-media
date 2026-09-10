import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import {
  Briefcase, MapPin, Wallet, Clock, ArrowRight, CheckCircle2,
  Star, Loader2, Target, FileText, Award, Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BackToMainSiteButton from "@/components/BackToMainSiteButton";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const CREAM = "#FFFBF5";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

function Section({ eyebrow, title, children }) {
  if (!children) return null;
  return (
    <section className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 py-12 sm:py-16">
      {eyebrow && (
        <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-3" style={{ color: GOLD }}>{eyebrow}</p>
      )}
      {title && <h2 className="text-2xl sm:text-3xl font-bold mb-6" style={{ color: TEXT_DARK }}>{title}</h2>}
      {children}
    </section>
  );
}

export default function AboutSalesJob() {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getPublicJobPage", {
          source_url: "/SalesGrowthAdvisor",
          host: window.location.hostname,
        });
        const d = res?.data ?? res;
        if (d?.job) {
          setJob(d.job);
          if (d.job.title) document.title = `${d.job.title} at Arriv Estate Media`;
        }
      } catch (_) {}
      setLoading(false);
    })();
    return () => { document.title = "Arriv Estate Media"; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: CREAM }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: CREAM }}>
        <h1 className="text-2xl font-bold mb-2" style={{ ...SERIF, color: TEXT_DARK }}>No job page published yet</h1>
        <p className="text-sm mb-6" style={{ color: "rgba(26,26,26,0.6)" }}>
          A job page hasn't been linked to this listing. An admin can create it from the Khetha IQ dashboard.
        </p>
        <BackToMainSiteButton />
      </div>
    );
  }

  const subtitle = job.page_description || job.description_text || "";
  const responsibilities = Array.isArray(job.responsibilities) ? job.responsibilities : [];
  const requiredQual = Array.isArray(job.required_qualifications) ? job.required_qualifications : [];
  const preferredQual = Array.isArray(job.preferred_qualifications) ? job.preferred_qualifications : [];
  const skills = Array.isArray(job.skills) ? job.skills : [];
  const benefits = Array.isArray(job.benefits) ? job.benefits : [];

  // Hero badges — only from modal-controlled fields
  const badges = [];
  if (job.location) badges.push({ icon: MapPin, label: job.location });
  if (job.employment_type) badges.push({ icon: Briefcase, label: job.employment_type.replace(/_/g, " ") });
  if (job.work_arrangement) badges.push({ icon: MapPin, label: job.work_arrangement });
  if (job.compensation) badges.push({ icon: Wallet, label: job.compensation });
  if (job.work_schedule) badges.push({ icon: Clock, label: job.work_schedule });

  const fmt = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "");

  return (
    <div className="min-h-screen" style={{ backgroundColor: CREAM, color: TEXT_DARK }}>
      {/* Hero */}
      <header className="px-5 sm:px-6 lg:px-8 pt-16 pb-14 sm:pt-20 sm:pb-20" style={{ backgroundColor: "#1A1A1A", color: CREAM }}>
        <div className="max-w-5xl mx-auto">
          <BackToMainSiteButton />
          <div className="flex items-center gap-2 mb-6">
            <Briefcase className="w-4 h-4" style={{ color: GOLD }} />
            <span className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: GOLD }}>Careers</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight max-w-3xl">{job.title || "Untitled Role"}</h1>
          {subtitle && (
            <p className="mt-5 text-base sm:text-lg max-w-2xl" style={{ color: "rgba(255,251,245,0.78)" }}>{subtitle}</p>
          )}
          {badges.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: "rgba(255,251,245,0.7)" }}>
              {badges.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <b.icon className="w-4 h-4" style={{ color: GOLD }} /> {fmt(b.label)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-8">
            <Button asChild className="rounded-lg font-semibold" style={{ backgroundColor: GOLD, color: TEXT_DARK }}>
              <Link to={createPageUrl("SalesJobApplication")}>Apply Now <ArrowRight className="w-4 h-4 ml-1" /></Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Department + Experience + Travel summary line */}
      {(job.department || job.experience_requirements || job.travel_requirements) && (
        <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 pt-10">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: "rgba(26,26,26,0.7)" }}>
            {job.department && <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4" style={{ color: GOLD }} /> {job.department}</span>}
            {job.experience_requirements && <span className="flex items-center gap-1.5"><Award className="w-4 h-4" style={{ color: GOLD }} /> {job.experience_requirements}</span>}
            {job.travel_requirements && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" style={{ color: GOLD }} /> {job.travel_requirements}</span>}
          </div>
        </div>
      )}

      {/* Description */}
      {job.description_text && (
        <Section eyebrow="Position Overview">
          <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.25)" }}>
            <p className="text-base sm:text-lg leading-relaxed whitespace-pre-line" style={{ color: "rgba(26,26,26,0.78)" }}>{job.description_text}</p>
          </div>
        </Section>
      )}

      {/* Responsibilities */}
      {responsibilities.length > 0 && (
        <Section eyebrow="Responsibilities" title="What you'll do">
          <div className="grid sm:grid-cols-2 gap-3">
            {responsibilities.map((r, i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl p-5" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
                <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>
                  <Target className="w-5 h-5" style={{ color: GOLD }} />
                </span>
                <span className="text-sm font-medium" style={{ color: TEXT_DARK }}>{r}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Required Qualifications */}
      {requiredQual.length > 0 && (
        <Section eyebrow="Qualifications" title="What we're looking for">
          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3">
            {requiredQual.map((q, i) => (
              <div key={i} className="flex items-start gap-2.5 py-1">
                <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
                <span className="text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>{q}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Preferred Qualifications */}
      {preferredQual.length > 0 && (
        <Section eyebrow="Nice to Have" title="Preferred qualifications">
          <div className="space-y-2">
            {preferredQual.map((q, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Star className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
                <span className="text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>{q}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <Section eyebrow="Skills" title="Key skills">
          <div className="flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <span key={i} className="px-3 py-1.5 rounded-full text-sm font-medium" style={{ backgroundColor: "rgba(184,149,106,0.12)", color: TEXT_DARK, border: "1px solid rgba(184,149,106,0.3)" }}>{s}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Benefits */}
      {benefits.length > 0 && (
        <Section eyebrow="Benefits" title="Why join us">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {benefits.map((b, i) => (
              <div key={i} className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
                <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: "#1A1A1A" }}>
                  <Heart className="w-5 h-5" style={{ color: GOLD }} />
                </span>
                <h3 className="font-semibold" style={{ color: TEXT_DARK }}>{b}</h3>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* CTA */}
      <section style={{ backgroundColor: "#1A1A1A", color: CREAM }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 py-14 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to apply?</h2>
          <p className="mt-3 text-sm sm:text-base" style={{ color: "rgba(255,251,245,0.7)" }}>
            {job.title ? `Submit your application for ${job.title}.` : "Submit your application today."}
          </p>
          <div className="mt-7">
            <Button asChild size="lg" className="rounded-lg font-semibold" style={{ backgroundColor: GOLD, color: TEXT_DARK }}>
              <Link to={createPageUrl("SalesJobApplication")}>Apply Now <ArrowRight className="w-4 h-4 ml-2" /></Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}