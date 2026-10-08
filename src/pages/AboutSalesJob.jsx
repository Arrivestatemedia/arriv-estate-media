import React, { useState, useEffect } from "react";
import { SALES_GROWTH_ADVISOR_FAQS as DEFAULT_FAQ } from "@/lib/jobFaqDefaults";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import {
  Phone,
  Mail,
  Users,
  Building2,
  HardHat,
  Briefcase,
  CalendarClock,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  MapPin,
  Clock,
  Star,
  ChevronDown,
  FileText,
  UserCheck,
  GraduationCap,
  TrendingUp,
  Handshake,
  Target,
  Presentation,
  Award,
  Loader2,
  Check,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BackToMainSiteButton from "@/components/BackToMainSiteButton";
import { SALES_JOB_DEFAULTS } from "@/lib/salesJobDefaults";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const CREAM = "#FFFBF5";
const MUTED = "rgba(26,26,26,0.7)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

// ── Evergreen defaults (used until a JobOpening is linked to /SalesGrowthAdvisor) ──
const DEFAULT_TITLE = SALES_JOB_DEFAULTS.title;
const DEFAULT_SUBTITLE = SALES_JOB_DEFAULTS.page_description;

const DEFAULT_WHO_YOU_BUILD = [
  { icon: Users, label: "Real Estate Agents" },
  { icon: Building2, label: "Brokers & Brokerages" },
  { icon: Briefcase, label: "Property Managers" },
  { icon: Building2, label: "Apartment Communities" },
  { icon: HardHat, label: "Developers & Builders" },
];

const DEFAULT_RESPONSIBILITIES = SALES_JOB_DEFAULTS.responsibilities;

const DEFAULT_QUALIFICATIONS = SALES_JOB_DEFAULTS.required_qualifications;

const DEFAULT_TRAINING_TOPICS = [
  { icon: FileText, label: "Arriv services & pricing" },
  { icon: Target, label: "Sales processes" },
  { icon: Users, label: "Prospecting strategies" },
  { icon: Briefcase, label: "Technology platform & CRM" },
  { icon: Presentation, label: "Customer relationship tools" },
  { icon: ShieldCheck, label: "Field outreach methods" },
  { icon: Award, label: "Ongoing coaching & support" },
];

const DEFAULT_WHY_JOIN = [
  { icon: CalendarClock, label: "Four-Day Workweek", desc: "Work Monday through Thursday and enjoy a three-day weekend every week." },
  { icon: TrendingUp, label: "Uncapped Commissions", desc: "Earn 15% on individual bookings, 10% on subscriptions, and recurring B2B commissions with no cap." },
  { icon: Wallet, label: "Recurring B2B Income", desc: "Earn 8% on eligible recurring B2B subscription revenue — build a book of business that pays you month after month." },
  { icon: GraduationCap, label: "Paid Training", desc: "12 hours of paid core onboarding plus ongoing coaching and supervised selling support." },
  { icon: Users, label: "Inbound Leads", desc: "Access inbound leads shared with the sales team alongside your own prospecting." },
  { icon: Star, label: "Founding Team", desc: "Join an emerging company's founding sales team and help establish Arriv Estate Media in your market." },
];



const DEFAULT_TRUST = [
  "W-2 Commission-Only",
  "$500–$5,000/Month Estimated",
  "Uncapped Commissions",
  "Four-Day Workweek",
  "Paid Training",
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
      } catch (_) {
        // No linked JobOpening yet — fall back to evergreen defaults below.
      }
      setLoading(false);
    })();
    return () => { document.title = "Arriv Estate Media"; };
  }, []);

  // Derive display values from the JobOpening, falling back to defaults.
  const title = job?.title || DEFAULT_TITLE;
  const subtitle = job?.page_description || job?.description_text || DEFAULT_SUBTITLE;
  const responsibilities =
    job?.responsibilities?.length ? job.responsibilities : DEFAULT_RESPONSIBILITIES;
  const qualifications =
    job?.required_qualifications?.length ? job.required_qualifications : DEFAULT_QUALIFICATIONS;
  const preferred = job?.preferred_qualifications || [];
  const skills = job?.skills || [];
  const benefits = job?.benefits || [];
  const faqs = (job?.faqs || []).map(f => ({ q: f.question || f.q, a: f.answer || f.a }));
  const whyJoin = benefits.length ? benefits : null; // when admin sets benefits, they replace WHY_JOIN

  const heroBadges = [];
  if (job?.location) heroBadges.push({ icon: MapPin, label: job.location });
  if (job?.employment_type) heroBadges.push({ icon: Briefcase, label: job.employment_type.replace(/_/g, " ") });
  if (job?.work_arrangement) heroBadges.push({ icon: MapPin, label: job.work_arrangement });
  if (job?.compensation) heroBadges.push({ icon: Wallet, label: job.compensation });
  if (job?.work_schedule) heroBadges.push({ icon: Clock, label: job.work_schedule });
  const heroBadgesToRender = heroBadges.length ? heroBadges : [
    { icon: Briefcase, label: "W-2 Commission-Only" },
    { icon: MapPin, label: "Field-Based with Remote Flexibility" },
    { icon: Wallet, label: "$500–$5,000/Month Estimated Commission" },
    { icon: Clock, label: "Monday–Thursday" },
  ];

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
              {job?.hero_badge || "Founding Sales Team"}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-6">
            <Briefcase className="w-4 h-4" style={{ color: GOLD }} />
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
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: "rgba(255,251,245,0.7)" }}>
            {heroBadgesToRender.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <b.icon className="w-4 h-4" style={{ color: GOLD }} /> {b.label}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="rounded-lg font-semibold"
              style={{ backgroundColor: GOLD, color: TEXT_DARK }}
            >
              <Link to={createPageUrl("SalesJobApplication")}>
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
            {DEFAULT_TRUST.map((t) => (
              <div key={t} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: GOLD }} />
                <span className="text-sm font-medium" style={{ color: "rgba(255,251,245,0.9)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* About Arriv */}
      <Section eyebrow="About Arriv Estate Media" id="about">
        <p className="text-lg leading-relaxed max-w-3xl" style={{ color: "rgba(26,26,26,0.78)" }}>
          Arriv Estate Media is building a modern real estate media marketplace connecting real estate
          professionals, brokerages, apartment communities, property managers, and developers with
          professional photography, videography, and creative media services. Our technology platform and
          media specialist network are established — we're now expanding our customer base.
        </p>
        <div
          className="mt-8 rounded-2xl p-6 sm:p-8"
          style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}
        >
          <p className="text-base sm:text-lg leading-relaxed" style={{ color: TEXT_DARK }}>
            We're looking for motivated sales professionals who can build relationships, identify
            opportunities, and close business. As a <strong>founding Sales Growth Advisor</strong>, you'll
            develop your own customer portfolio, establish commercial relationships, and earn recurring
            commissions as the business grows.
          </p>
        </div>
      </Section>

      {/* Position Overview */}
      <Section eyebrow="Position Overview" id="how-it-works">
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.25)" }}
        >
          <p className="text-base sm:text-lg leading-relaxed" style={{ color: "rgba(26,26,26,0.78)" }}>
            {subtitle}
          </p>
          <p className="mt-4 text-base leading-relaxed" style={{ color: "rgba(26,26,26,0.7)" }}>
            This is a territory-based role. About half of your working week is spent in the field, meeting
            prospective customers in person. The rest is flexible remote work: prospecting, follow-up, and
            closing. A typical week includes three field-focused days and one dedicated remote day.
          </p>
          <p className="mt-4 text-base leading-relaxed" style={{ color: "rgba(26,26,26,0.7)" }}>
            We're especially interested in experienced sales professionals and individuals with backgrounds in
            real estate, account management, business development, and other relationship-driven industries.
          </p>
        </div>
      </Section>

      {/* Who You'll Build Relationships With */}
      <Section eyebrow="Who You'll Work With" title="Build relationships with">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DEFAULT_WHO_YOU_BUILD.map(({ icon: Icon, label }) => (
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
      </Section>

      {/* Responsibilities */}
      <Section eyebrow="Responsibilities" title="What you'll do">
        <div className="grid sm:grid-cols-2 gap-3">
          {responsibilities.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-2xl p-5"
              style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
            >
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(184,149,106,0.12)" }}
              >
                <Target className="w-5 h-5" style={{ color: GOLD }} />
              </span>
              <span className="text-sm font-medium" style={{ color: TEXT_DARK }}>{r}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Qualifications */}
      <Section eyebrow="Qualifications" title="What we're looking for">
        <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3">
          {qualifications.map((q, i) => (
            <div key={i} className="flex items-start gap-2.5 py-1">
              <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
              <span className="text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>{q}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
          Experience in real estate, mortgage lending, insurance, advertising, property management, or
          hospitality sales is especially valuable.
        </p>
      </Section>

      {/* Preferred Qualifications (only if set) */}
      {preferred.length > 0 && (
        <Section eyebrow="Nice to Have" title="Preferred qualifications">
          <div className="space-y-2">
            {preferred.map((q, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Star className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
                <span className="text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>{q}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Skills (only if set) */}
      {skills.length > 0 && (
        <Section eyebrow="Skills" title="Key skills">
          <div className="flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: "rgba(184,149,106,0.12)", color: TEXT_DARK, border: "1px solid rgba(184,149,106,0.3)" }}
              >
                {s}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Compensation */}
      <Section eyebrow="Compensation" title="Uncapped earning potential">
        <div
          className="rounded-2xl p-6 sm:p-8 mb-6"
          style={{ backgroundColor: "rgba(184,149,106,0.08)", border: "1px solid rgba(184,149,106,0.3)" }}
        >
          <p className="text-base leading-relaxed" style={{ color: TEXT_DARK }}>
            This is a W-2, commission-only position with no guaranteed base salary or draw. Commissions are
            uncapped. The estimated monthly commission range is <strong>$500–$5,000</strong>, based on
            projected volumes of individual bookings, individual subscriptions, and B2B accounts. Actual
            earnings depend entirely on individual sales performance, and no minimum earnings are guaranteed.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-2xl" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>📸</span>
            <h3 className="font-semibold" style={{ color: TEXT_DARK }}>15% — Individual Bookings</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Earn 15% commission on qualifying individual media bookings.
            </p>
          </div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-2xl" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>🔄</span>
            <h3 className="font-semibold" style={{ color: TEXT_DARK }}>10% — Individual Subscriptions</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Earn 10% on eligible individual subscription revenue.
            </p>
          </div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-2xl" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>🏢</span>
            <h3 className="font-semibold" style={{ color: TEXT_DARK }}>60% — B2B Implementation</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Earn 60% on eligible B2B implementation fees.
            </p>
          </div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-2xl" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>🚀</span>
            <h3 className="font-semibold" style={{ color: TEXT_DARK }}>15% — First-Month B2B</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Earn 15% on eligible first-month B2B subscription revenue.
            </p>
          </div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-2xl" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>📈</span>
            <h3 className="font-semibold" style={{ color: TEXT_DARK }}>8% — Recurring B2B</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Earn 8% on eligible recurring B2B subscription revenue thereafter — build a book of business that pays you month after month.
            </p>
          </div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-2xl" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>🎓</span>
            <h3 className="font-semibold" style={{ color: TEXT_DARK }}>Paid Required Training</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Required standalone training is paid separately at the applicable legally required rate.
            </p>
          </div>
        </div>
        <p className="mt-6 text-sm" style={{ color: "rgba(26,26,26,0.6)" }}>
          Commissions are earned on eligible collected revenue and governed by the written commission
          agreement. Arriv is an early-stage company, and our customer base is still developing.
        </p>
      </Section>

      {/* Training */}
      <Section eyebrow="Training & Support" title="12 hours of paid core onboarding">
        <p className="text-base leading-relaxed max-w-3xl mb-8" style={{ color: "rgba(26,26,26,0.7)" }}>
          Arriv provides 12 hours of paid core onboarding covering our services, pricing, sales processes,
          technology platform, and customer relationship tools. Required standalone training is paid
          separately at the applicable legally required rate. You'll also receive ongoing coaching,
          supervised selling support, and direct access to company leadership. Training covers:
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DEFAULT_TRAINING_TOPICS.map(({ icon: Icon, label }) => (
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
      </Section>

      {/* Why Join / Benefits */}
      <Section eyebrow="Why Join Arriv?" title="Be part of the founding team">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {whyJoin
            ? whyJoin.map((b, i) => (
              <div
                key={i}
                className="rounded-2xl p-6 h-full"
                style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
              >
                <span
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "#1A1A1A" }}
                >
                  <Heart className="w-5 h-5" style={{ color: GOLD }} />
                </span>
                <h3 className="font-semibold" style={{ color: TEXT_DARK }}>{b}</h3>
              </div>
            ))
            : DEFAULT_WHY_JOIN.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="rounded-2xl p-6 h-full"
                style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
              >
                <span
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "#1A1A1A" }}
                >
                  <Icon className="w-5 h-5" style={{ color: GOLD }} />
                </span>
                <h3 className="font-semibold" style={{ color: TEXT_DARK }}>{label}</h3>
                <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>{desc}</p>
              </div>
            ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section eyebrow="FAQ" title="Frequently asked questions">
        <div className="space-y-3">
          {(faqs.length ? faqs : DEFAULT_FAQ).map((item, i) => (
            <FaqItem key={item.q || i} q={item.q} a={item.a} />
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
              Founding sales team — limited spots available
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to join the founding sales team?</h2>
          <p className="mt-3 text-sm sm:text-base" style={{ color: "rgba(255,251,245,0.7)" }}>
            Build your income, build relationships, and help shape the future of Arriv Estate Media.
          </p>
          <div className="mt-7">
            <Button
              asChild
              size="lg"
              className="rounded-lg font-semibold"
              style={{ backgroundColor: GOLD, color: TEXT_DARK }}
            >
              <Link to={createPageUrl("SalesJobApplication")}>
                Apply Now <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}