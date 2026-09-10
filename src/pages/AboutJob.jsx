import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import {
  Camera,
  Video,
  Plane,
  Moon,
  Building2,
  CalendarClock,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  MapPin,
  Clock,
  Users,
  Star,
  ChevronDown,
  FileText,
  UserCheck,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BackToMainSiteButton from "@/components/BackToMainSiteButton";
import { MEDIA_JOB_DEFAULTS } from "@/lib/mediaJobDefaults";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const CREAM = "#FFFBF5";

const PROJECTS = [
  { icon: Building2, label: "Residential real estate photography" },
  { icon: Camera, label: "Luxury property photography" },
  { icon: Video, label: "Real estate videography" },
  { icon: Plane, label: "Drone photography / videography" },
  { icon: Moon, label: "Twilight photography" },
  { icon: Users, label: "Floor plans & other property marketing services" },
];

const WHY_JOIN = [
  { icon: CalendarClock, label: "Flexible Schedule", desc: "Choose the projects you want." },
  { icon: Wallet, label: "Additional Income", desc: "Earn extra money without replacing your existing clients." },
  { icon: Users, label: "Grow With Us", desc: "Become part of Arriv's trusted network of media specialists as we expand into new markets." },
  { icon: ShieldCheck, label: "No Exclusivity", desc: "Continue working with your own clients while accepting Arriv projects." },
];

const STEPS = [
  { icon: FileText, label: "Apply to join the network." },
  { icon: ClipboardList, label: "Our team reviews your portfolio." },
  { icon: UserCheck, label: "Get approved as an Arriv Media Specialist." },
  { icon: MapPin, label: "Receive project requests from real estate professionals in your area." },
  { icon: CalendarClock, label: "Accept only the jobs you want." },
  { icon: Wallet, label: "Complete the project and get paid." },
];

const FAQ = [
  {
    q: "Is this full-time?",
    a: "No. This is an independent contractor role. You choose which projects to accept, so you can work as much or as little as fits your schedule.",
  },
  {
    q: "Do I have to accept every project?",
    a: "Never. You only accept the projects you want. There's no penalty for declining, and you keep full control of your calendar.",
  },
  {
    q: "How do I get paid?",
    a: "You're paid a fixed rate per completed project, based on the services requested. Payouts are issued after the project is completed and the media is delivered.",
  },
  {
    q: "Can I continue working with my own clients?",
    a: "Absolutely. There's no exclusivity. Arriv projects are meant to fill the gaps in your schedule while you keep growing your own business.",
  },
  {
    q: "Do I need drone experience?",
    a: "Drone experience is preferred but not required. You'll still receive plenty of photo and video projects without it.",
  },
  {
    q: "How quickly will projects become available?",
    a: "As we launch in Maryland, we're building out our founding network now. Approved specialists receive opportunities as projects come online in their area.",
  },
];

const TRUST = [
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
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
      >
        <span className="text-sm sm:text-base font-semibold" style={{ color: TEXT_DARK }}>{q}</span>
        <ChevronDown
          className="w-5 h-5 flex-shrink-0 transition-transform"
          style={{ color: GOLD, transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      {open && (
        <p className="px-5 pb-5 text-sm leading-relaxed" style={{ color: "rgba(26,26,26,0.7)" }}>
          {a}
        </p>
      )}
    </div>
  );
}

export default function AboutJob() {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getPublicJobPage", {
          source_url: "/MediaSpecialist",
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

  // Derive display values from the JobOpening, falling back to defaults.
  const title = job?.title || MEDIA_JOB_DEFAULTS.title;
  const subtitle = job?.page_description || job?.description_text || MEDIA_JOB_DEFAULTS.page_description;
  const projectItems = job?.responsibilities?.length
    ? job.responsibilities.map(label => ({ icon: Camera, label }))
    : PROJECTS;
  const qualifications = job?.required_qualifications?.length
    ? job.required_qualifications
    : MEDIA_JOB_DEFAULTS.required_qualifications;
  const preferred = job?.preferred_qualifications?.length
    ? job.preferred_qualifications
    : (job?.skills?.length ? job.skills : MEDIA_JOB_DEFAULTS.preferred_qualifications);
  const benefits = job?.benefits?.length ? job.benefits : MEDIA_JOB_DEFAULTS.benefits;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: CREAM }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: CREAM, color: TEXT_DARK }}>
      {/* Hero */}
      <header
        className="px-5 sm:px-6 lg:px-8 pt-16 pb-14 sm:pt-20 sm:pb-20"
        style={{ backgroundColor: "#1A1A1A", color: CREAM }}
      >
        <div className="max-w-5xl mx-auto">
          <BackToMainSiteButton />
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
            style={{ backgroundColor: "rgba(184,149,106,0.15)", border: "1px solid rgba(184,149,106,0.4)" }}
          >
            <Star className="w-3.5 h-3.5" style={{ color: GOLD }} />
            <span className="text-xs font-semibold tracking-wide" style={{ color: GOLD }}>
              Founding Media Specialist – Maryland Launch
            </span>
          </div>
          <div className="flex items-center gap-2 mb-6">
            <Camera className="w-4 h-4" style={{ color: GOLD }} />
            <span className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: GOLD }}>
              Careers
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight max-w-3xl">
            {title}
          </h1>
          <p className="mt-5 text-base sm:text-lg max-w-2xl" style={{ color: "rgba(255,251,245,0.78)" }}>
            {subtitle}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="rounded-lg font-semibold"
              style={{ backgroundColor: GOLD, color: TEXT_DARK }}
            >
              <Link to={createPageUrl("JobApplication")}>
                Apply Now <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ color: CREAM, border: "1px solid rgba(184,149,106,0.4)" }}
            >
              Learn more
            </a>
          </div>
        </div>
      </header>

      {/* Trust badges */}
      <div style={{ backgroundColor: "#1A1A1A", color: CREAM }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 pb-10 -mt-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {TRUST.map((t) => (
              <div key={t} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: GOLD }} />
                <span className="text-sm font-medium" style={{ color: "rgba(255,251,245,0.9)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Goal statement */}
      <Section id="goal">
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}
        >
          <p className="text-base sm:text-lg leading-relaxed" style={{ color: TEXT_DARK }}>
            <strong>Our goal:</strong> help fill gaps in your schedule while allowing you to continue growing
            your own business. Consistent project opportunities as our platform grows.
          </p>
        </div>
      </Section>

      {/* How It Works */}
      <Section eyebrow="How It Works" id="how-it-works">
        <div className="grid sm:grid-cols-2 gap-4">
          {STEPS.map(({ icon: Icon, label }, i) => (
            <div
              key={label}
              className="flex items-center gap-4 rounded-2xl p-5"
              style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
            >
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm"
                style={{ backgroundColor: "#1A1A1A", color: GOLD }}
              >
                {i + 1}
              </span>
              <span className="text-sm font-medium" style={{ color: TEXT_DARK }}>{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* About */}
      <Section eyebrow="About Arriv Estate Media" id="about">
        <p className="text-lg leading-relaxed max-w-3xl" style={{ color: "rgba(26,26,26,0.78)" }}>
          {job?.description_text || MEDIA_JOB_DEFAULTS.description_text}
        </p>
        <div
          className="mt-8 rounded-2xl p-6 sm:p-8"
          style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.25)" }}
        >
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
            <div>
              <h3 className="font-semibold" style={{ color: TEXT_DARK }}>
                Now launching in {job?.location || "Maryland"}
              </h3>
              <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
                We're currently expanding our network of media specialists as we prepare to launch in {job?.location || "Maryland"}.
                Join early and grow with us.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* What You'll Do */}
      <Section eyebrow="What You'll Do" title="Projects you may be assigned">
        <p className="text-base leading-relaxed max-w-3xl mb-8" style={{ color: "rgba(26,26,26,0.7)" }}>
          As an independent contractor, you'll have the flexibility to accept projects that fit your schedule.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {projectItems.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl px-4 py-3.5"
              style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
            >
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(184,149,106,0.12)" }}
              >
                <Icon className="w-5 h-5" style={{ color: GOLD }} />
              </span>
              <span className="text-sm font-medium" style={{ color: TEXT_DARK }}>{label}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs" style={{ color: "rgba(26,26,26,0.5)" }}>
          Floor plans and other property marketing services are preferred but not required.
        </p>
      </Section>

      {/* Why Join Arriv */}
      <Section eyebrow="Why Join Arriv?" title="Built for independent professionals">
        <div className="grid sm:grid-cols-2 gap-4">
          {WHY_JOIN.map(({ icon: Icon, label, desc }) => {
            const isGrow = label === "Grow With Us";
            const Card = (
              <div
                className="rounded-2xl p-6 h-full transition-transform"
                style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
              >
                <span
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "#1A1A1A" }}
                >
                  <Icon className="w-5 h-5" style={{ color: GOLD }} />
                </span>
                <h3 className="font-semibold flex items-center gap-1.5" style={{ color: TEXT_DARK }}>
                  {label}
                  {isGrow && <ArrowRight className="w-4 h-4" style={{ color: GOLD }} />}
                </h3>
                <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>{desc}</p>
              </div>
            );
            return isGrow ? (
              <Link key={label} to={createPageUrl("JobApplication")} className="block hover:-translate-y-0.5">
                {Card}
              </Link>
            ) : (
              <div key={label}>{Card}</div>
            );
          })}
        </div>
      </Section>

      {/* Qualifications + Preferred */}
      <Section eyebrow="Qualifications" title="What we're looking for">
        <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3">
          {qualifications.map((q) => (
            <div key={q} className="flex items-start gap-2.5 py-1">
              <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
              <span className="text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>{q}</span>
            </div>
          ))}
        </div>

        <h3 className="text-lg font-semibold mt-10 mb-4" style={{ color: TEXT_DARK }}>
          Preferred Experience
        </h3>
        <div className="flex flex-wrap gap-2">
          {preferred.map((p) => (
            <span
              key={p}
              className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: "rgba(184,149,106,0.12)", color: "#8a6f4d", border: "1px solid rgba(184,149,106,0.25)" }}
            >
              {p}
            </span>
          ))}
        </div>
      </Section>

      {/* Job Type & Compensation */}
      <Section eyebrow="Job Type & Compensation">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <Clock className="w-5 h-5 mb-3" style={{ color: GOLD }} />
            <h3 className="font-semibold" style={{ color: TEXT_DARK }}>
              {job?.employment_type ? job.employment_type.replace(/_/g, " ") : "Independent Contractor"}
            </h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Work is assigned on a per-project basis. {job?.work_schedule || "Flexible schedule"}.
            </p>
          </div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <Wallet className="w-5 h-5 mb-3" style={{ color: GOLD }} />
            <h3 className="font-semibold" style={{ color: TEXT_DARK }}>{job?.compensation || "Get Paid Per Project"}</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Transparent per-project payouts based on the services requested.
            </p>
          </div>
        </div>
        <div
          className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-6 py-4"
          style={{ backgroundColor: "rgba(26,26,26,0.04)", border: "1px solid rgba(184,149,106,0.2)" }}
        >
          <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: GOLD }}>Benefits</span>
          {benefits.map((b, i) => (
            <span key={i} className="text-sm" style={{ color: "rgba(26,26,26,0.75)" }}>
              {b}{i < benefits.length - 1 && <span className="mx-2">·</span>}
            </span>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section eyebrow="FAQ" title="Frequently asked questions">
        <div className="space-y-3">
          {FAQ.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </Section>

      {/* CTA */}
      <section style={{ backgroundColor: "#1A1A1A", color: CREAM }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 py-14 text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ backgroundColor: "rgba(184,149,106,0.15)", border: "1px solid rgba(184,149,106,0.4)" }}
          >
            <Star className="w-3.5 h-3.5" style={{ color: GOLD }} />
            <span className="text-xs font-semibold tracking-wide" style={{ color: GOLD }}>
              Limited onboarding spots available during our Maryland launch
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to join the network?</h2>
          <p className="mt-3 text-sm sm:text-base" style={{ color: "rgba(255,251,245,0.7)" }}>
            We're currently onboarding our founding network of media specialists in Maryland.
          </p>
          <div className="mt-7">
            <Button
              asChild
              size="lg"
              className="rounded-lg font-semibold"
              style={{ backgroundColor: GOLD, color: TEXT_DARK }}
            >
              <Link to={createPageUrl("JobApplication")}>
                Apply Now <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}