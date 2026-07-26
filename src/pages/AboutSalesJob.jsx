import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BackToMainSiteButton from "@/components/BackToMainSiteButton";

const WHO_YOU_BUILD = [
  { icon: Users, label: "Real Estate Agents" },
  { icon: Users, label: "Real Estate Teams" },
  { icon: Building2, label: "Brokerages" },
  { icon: HardHat, label: "Home Builders" },
  { icon: Briefcase, label: "Property Management Companies" },
];

const RESPONSIBILITIES = [
  { icon: Target, label: "Prospect and generate new business through phone calls, email, networking, referrals, and social media." },
  { icon: Handshake, label: "Build relationships with real estate agents, teams, brokerages, builders, and property managers." },
  { icon: CalendarClock, label: "Schedule meetings and product demonstrations." },
  { icon: Presentation, label: "Present Arriv Estate Media's services and platform." },
  { icon: CheckCircle2, label: "Close new client accounts." },
  { icon: Users, label: "Maintain relationships with existing clients." },
  { icon: ArrowRight, label: "Follow up with customers to encourage repeat business." },
  { icon: TrendingUp, label: "Meet and exceed sales goals." },
  { icon: Star, label: "Represent the Arriv brand professionally." },
];

const QUALIFICATIONS = [
  "Excellent communication skills",
  "Strong interpersonal skills",
  "Self-motivated and goal-oriented",
  "Comfortable with outbound sales and prospecting",
  "Professional attitude",
  "Highly organized",
  "Coachable with a desire to learn",
];

const TRAINING_TOPICS = [
  { icon: FileText, label: "Arriv products and services" },
  { icon: Target, label: "Sales techniques" },
  { icon: Users, label: "Prospecting strategies" },
  { icon: Briefcase, label: "CRM training" },
  { icon: Presentation, label: "Client presentations" },
  { icon: ShieldCheck, label: "Objection handling" },
  { icon: Award, label: "Closing strategies" },
];

const WHY_JOIN = [
  { icon: Wallet, label: "$500 Training Bonus", desc: "Earn a bonus after completing our two-week onboarding and training program." },
  { icon: TrendingUp, label: "Uncapped Commission", desc: "Your earning potential is based entirely on the business you generate." },
  { icon: CalendarClock, label: "Flexible Schedule", desc: "This is a 100% remote role — work from anywhere and set your own hours." },
  { icon: GraduationCap, label: "Comprehensive Training", desc: "Full training provided — no real estate experience necessary." },
  { icon: TrendingUp, label: "Career Growth", desc: "Join the founding sales team and grow as Arriv expands." },
  { icon: Star, label: "Shape the Future", desc: "Help build an innovative real estate technology company from the ground up." },
];

const FAQ = [
  {
    q: "Is this a salaried position?",
    a: "No. This is a 100% commission-based Independent Contractor (1099) opportunity. There is no salary cap — your earning potential is based entirely on the business you generate.",
  },
  {
    q: "Do I need real estate experience?",
    a: "No. No real estate experience is necessary — we provide the training. Sales experience is preferred but not required.",
  },
  {
    q: "What is the $500 Training Bonus?",
    a: "New Arriv Sales Growth Advisors who successfully complete our two-week onboarding and training program will receive a $500 Training Bonus.",
  },
  {
    q: "Where is this role based?",
    a: "This is a 100% remote role. You can work from anywhere — no office or hybrid requirements.",
  },
  {
    q: "What does the training cover?",
    a: "Training includes Arriv products and services, sales techniques, prospecting strategies, CRM training, client presentations, objection handling, and closing strategies.",
  },
  {
    q: "Who will I be selling to?",
    a: "You'll build relationships with real estate agents, real estate teams, brokerages, home builders, and property management companies.",
  },
];

const TRUST = [
  "Independent Contractor (1099)",
  "100% Commission",
  "$500 Training Bonus",
  "Uncapped Earning Potential",
  "100% Remote",
];

function Section({ eyebrow, title, children, id }) {
  return (
    <section id={id} className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 py-12 sm:py-16">
      {eyebrow && (
        <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-3" style={{ color: "#B8956A" }}>
          {eyebrow}
        </p>
      )}
      {title && (
        <h2 className="text-2xl sm:text-3xl font-bold mb-6" style={{ color: "#1A1A1A" }}>
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
        <span className="text-sm sm:text-base font-semibold" style={{ color: "#1A1A1A" }}>{q}</span>
        <ChevronDown
          className="w-5 h-5 flex-shrink-0 transition-transform"
          style={{ color: "#B8956A", transform: open ? "rotate(180deg)" : "none" }}
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
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFFBF5", color: "#1A1A1A" }}>
      {/* Hero */}
      <header
        className="px-5 sm:px-6 lg:px-8 pt-16 pb-14 sm:pt-20 sm:pb-20"
        style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}
      >
        <div className="max-w-5xl mx-auto">
          <BackToMainSiteButton />
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
            style={{ backgroundColor: "rgba(184,149,106,0.15)", border: "1px solid rgba(184,149,106,0.4)" }}
          >
            <Star className="w-3.5 h-3.5" style={{ color: "#B8956A" }} />
            <span className="text-xs font-semibold tracking-wide" style={{ color: "#B8956A" }}>
              Founding Sales Team – 100% Remote
            </span>
          </div>
          <div className="flex items-center gap-2 mb-6">
            <Briefcase className="w-4 h-4" style={{ color: "#B8956A" }} />
            <span className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: "#B8956A" }}>
              Careers
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight max-w-3xl">
            Arriv Sales Growth Advisor – Real Estate Media
          </h1>
          <p className="mt-5 text-base sm:text-lg max-w-2xl" style={{ color: "rgba(255,251,245,0.78)" }}>
            Join Arriv Estate Media's founding sales team. Build long-term relationships with real estate
            professionals while growing your income through uncapped commissions.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: "rgba(255,251,245,0.7)" }}>
            <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4" style={{ color: "#B8956A" }} /> Independent Contractor (1099)</span>
            <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" style={{ color: "#B8956A" }} /> 100% Remote – Work From Anywhere</span>
            <span className="flex items-center gap-1.5"><Wallet className="w-4 h-4" style={{ color: "#B8956A" }} /> 100% Commission + $500 Training Bonus</span>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="rounded-lg font-semibold"
              style={{ backgroundColor: "#B8956A", color: "#1A1A1A" }}
            >
              <Link to={createPageUrl("SalesJobApplication")}>
                Apply Now <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ color: "#FFFBF5", border: "1px solid rgba(184,149,106,0.4)" }}
            >
              Learn more
            </a>
          </div>
        </div>
      </header>

      {/* Trust badges */}
      <div style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 pb-10 -mt-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {TRUST.map((t) => (
              <div key={t} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: "#B8956A" }} />
                <span className="text-sm font-medium" style={{ color: "rgba(255,251,245,0.9)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* About Arriv */}
      <Section eyebrow="About Arriv Estate Media" id="about">
        <p className="text-lg leading-relaxed max-w-3xl" style={{ color: "rgba(26,26,26,0.78)" }}>
          Arriv Estate Media is redefining the way real estate professionals order, manage, and receive
          professional media services. Our platform connects real estate agents, brokerages, builders, and
          property managers with trusted photographers, videographers, drone pilots, and media specialists
          through one seamless experience.
        </p>
        <div
          className="mt-8 rounded-2xl p-6 sm:p-8"
          style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}
        >
          <p className="text-base sm:text-lg leading-relaxed" style={{ color: "#1A1A1A" }}>
            We're building our <strong>founding sales team</strong> and looking for driven professionals who
            are passionate about sales, relationship-building, and helping businesses grow.
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
            As an Arriv Sales Growth Advisor, you'll be responsible for introducing real estate professionals
            to Arriv Estate Media and helping them discover a better way to manage their real estate media needs.
            This is a relationship-focused sales position where you'll build long-term partnerships while
            growing your own income through uncapped commissions.
          </p>
          <p className="mt-4 text-base leading-relaxed" style={{ color: "rgba(26,26,26,0.7)" }}>
            If you're entrepreneurial, motivated, and enjoy talking with people, we'd love to meet you.
          </p>
        </div>
      </Section>

      {/* Who You'll Build Relationships With */}
      <Section eyebrow="Who You'll Work With" title="Build relationships with">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {WHO_YOU_BUILD.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl px-4 py-3.5"
              style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
            >
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(184,149,106,0.12)" }}
              >
                <Icon className="w-5 h-5" style={{ color: "#B8956A" }} />
              </span>
              <span className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Responsibilities */}
      <Section eyebrow="Responsibilities" title="What you'll do">
        <div className="grid sm:grid-cols-2 gap-3">
          {RESPONSIBILITIES.map(({ icon: Icon, label }, i) => (
            <div
              key={label}
              className="flex items-center gap-4 rounded-2xl p-5"
              style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
            >
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(184,149,106,0.12)" }}
              >
                <Icon className="w-5 h-5" style={{ color: "#B8956A" }} />
              </span>
              <span className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Qualifications */}
      <Section eyebrow="Qualifications" title="What we're looking for">
        <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3">
          {QUALIFICATIONS.map((q) => (
            <div key={q} className="flex items-start gap-2.5 py-1">
              <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "#B8956A" }} />
              <span className="text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>{q}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
          Sales experience is preferred but not required. No real estate experience is necessary — we provide the training.
        </p>
      </Section>

      {/* Compensation */}
      <Section eyebrow="Compensation" title="Uncapped earning potential">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <Wallet className="w-5 h-5 mb-3" style={{ color: "#B8956A" }} />
            <h3 className="font-semibold" style={{ color: "#1A1A1A" }}>100% Commission (1099)</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Independent Contractor opportunity with no salary cap — your earning potential is based entirely on the business you generate.
            </p>
          </div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <Award className="w-5 h-5 mb-3" style={{ color: "#B8956A" }} />
            <h3 className="font-semibold" style={{ color: "#1A1A1A" }}>$500 Training Bonus</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              New Sales Growth Advisors who complete our two-week onboarding and training program receive a $500 bonus.
            </p>
          </div>
        </div>
      </Section>

      {/* Training */}
      <Section eyebrow="Training Program" title="Two weeks of comprehensive training">
        <p className="text-base leading-relaxed max-w-3xl mb-8" style={{ color: "rgba(26,26,26,0.7)" }}>
          Complete our two-week onboarding and training program and earn your $500 Training Bonus. Training covers everything you need to succeed:
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TRAINING_TOPICS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl px-4 py-3.5"
              style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
            >
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(184,149,106,0.12)" }}
              >
                <Icon className="w-5 h-5" style={{ color: "#B8956A" }} />
              </span>
              <span className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Why Join Arriv */}
      <Section eyebrow="Why Join Arriv?" title="Be part of the founding team">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {WHY_JOIN.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="rounded-2xl p-6 h-full"
              style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
            >
              <span
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ backgroundColor: "#1A1A1A" }}
              >
                <Icon className="w-5 h-5" style={{ color: "#B8956A" }} />
              </span>
              <h3 className="font-semibold" style={{ color: "#1A1A1A" }}>{label}</h3>
              <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>{desc}</p>
            </div>
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
      <section style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 py-14 text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ backgroundColor: "rgba(184,149,106,0.15)", border: "1px solid rgba(184,149,106,0.4)" }}
          >
            <Star className="w-3.5 h-3.5" style={{ color: "#B8956A" }} />
            <span className="text-xs font-semibold tracking-wide" style={{ color: "#B8956A" }}>
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
              style={{ backgroundColor: "#B8956A", color: "#1A1A1A" }}
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