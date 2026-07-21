import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Camera,
  Video,
  Plane,
  Moon,
  Building2,
  CalendarClock,
  Wallet,
  ShieldCheck,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  MapPin,
  Clock,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const PROJECTS = [
  { icon: Building2, label: "Residential real estate photography" },
  { icon: Camera, label: "Luxury property photography" },
  { icon: Video, label: "Real estate videography" },
  { icon: Plane, label: "Drone photography / videography" },
  { icon: Moon, label: "Twilight photography" },
  { icon: Users, label: "Floor plans & other property marketing services" },
];

const OFFERS = [
  { icon: CalendarClock, label: "Flexible schedule", desc: "Accept only the jobs you want" },
  { icon: Wallet, label: "Additional income opportunities", desc: "Fill gaps in your schedule" },
  { icon: ShieldCheck, label: "No monthly fees", desc: "Keep more of what you earn" },
  { icon: MessageSquare, label: "Simple communication", desc: "Easy project management built in" },
];

const QUALIFICATIONS = [
  "Experience photographing residential real estate",
  "Professional camera equipment",
  "Reliable transportation",
  "Strong communication skills",
  "Ability to meet deadlines",
  "Attention to detail",
];

const PREFERRED = [
  "HDR Photography",
  "Adobe Lightroom",
  "Photoshop",
  "Matterport",
  "Zillow 3D Home",
  "Real estate video editing",
  "Drone photography",
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

export default function AboutJob() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFFBF5", color: "#1A1A1A" }}>
      {/* Hero */}
      <header
        className="px-5 sm:px-6 lg:px-8 pt-16 pb-14 sm:pt-20 sm:pb-20"
        style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Camera className="w-4 h-4" style={{ color: "#B8956A" }} />
            <span className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: "#B8956A" }}>
              Careers
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight max-w-3xl">
            Become a Media Specialist with{" "}
            <span style={{ color: "#B8956A" }}>Arriv Estate Media</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg max-w-2xl" style={{ color: "rgba(255,251,245,0.78)" }}>
            We're expanding our network of photographers and videographers as we prepare to launch in
            <span style={{ color: "#B8956A" }}> Maryland</span>. Work as an independent contractor on your own schedule.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="rounded-lg font-semibold"
              style={{ backgroundColor: "#B8956A", color: "#1A1A1A" }}
            >
              <Link to={createPageUrl("JobApplication")}>
                Apply Now <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
            <a
              href="#about"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ color: "#FFFBF5", border: "1px solid rgba(184,149,106,0.4)" }}
            >
              Learn more
            </a>
          </div>
        </div>
      </header>

      {/* About */}
      <Section eyebrow="About Arriv Estate Media" id="about">
        <p className="text-lg leading-relaxed max-w-3xl" style={{ color: "rgba(26,26,26,0.78)" }}>
          Arriv Estate Media is building the future of real estate media management. Our platform connects
          real estate agents, builders, and property managers with talented photographers and videographers
          while simplifying scheduling, communication, project management, and media delivery.
        </p>
        <div
          className="mt-8 rounded-2xl p-6 sm:p-8"
          style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.25)" }}
        >
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "#B8956A" }} />
            <div>
              <h3 className="font-semibold" style={{ color: "#1A1A1A" }}>
                Now launching in Maryland
              </h3>
              <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
                We're currently expanding our network of media specialists as we prepare to launch in Maryland.
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
          {PROJECTS.map(({ icon: Icon, label }) => (
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
        <p className="mt-4 text-xs" style={{ color: "rgba(26,26,26,0.5)" }}>
          Floor plans and other property marketing services are preferred but not required.
        </p>
      </Section>

      {/* What We Offer */}
      <Section eyebrow="What We Offer" title="Built for independent professionals">
        <div className="grid sm:grid-cols-2 gap-4">
          {OFFERS.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="rounded-2xl p-6"
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
        <div
          className="mt-6 rounded-2xl p-6"
          style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}
        >
          <p className="text-sm leading-relaxed" style={{ color: "#1A1A1A" }}>
            <strong>Our goal:</strong> help fill gaps in your schedule while allowing you to continue growing
            your own business. Consistent project opportunities as our platform grows.
          </p>
        </div>
      </Section>

      {/* Qualifications + Preferred */}
      <Section eyebrow="Qualifications" title="What we're looking for">
        <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3">
          {QUALIFICATIONS.map((q) => (
            <div key={q} className="flex items-start gap-2.5 py-1">
              <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "#B8956A" }} />
              <span className="text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>{q}</span>
            </div>
          ))}
        </div>

        <h3 className="text-lg font-semibold mt-10 mb-4" style={{ color: "#1A1A1A" }}>
          Preferred Experience
        </h3>
        <div className="flex flex-wrap gap-2">
          {PREFERRED.map((p) => (
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
            <Clock className="w-5 h-5 mb-3" style={{ color: "#B8956A" }} />
            <h3 className="font-semibold" style={{ color: "#1A1A1A" }}>Independent Contractor</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Work is assigned on a per-project basis. Flexible schedule.
            </p>
          </div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}>
            <Wallet className="w-5 h-5 mb-3" style={{ color: "#B8956A" }} />
            <h3 className="font-semibold" style={{ color: "#1A1A1A" }}>Competitive Compensation</h3>
            <p className="mt-1 text-sm" style={{ color: "rgba(26,26,26,0.65)" }}>
              Per-project payouts based on the services requested.
            </p>
          </div>
        </div>
        <div
          className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-6 py-4"
          style={{ backgroundColor: "rgba(26,26,26,0.04)", border: "1px solid rgba(184,149,106,0.2)" }}
        >
          <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "#B8956A" }}>Benefits</span>
          <span className="text-sm" style={{ color: "rgba(26,26,26,0.75)" }}>Flexible schedule</span>
          <span className="text-sm" style={{ color: "rgba(26,26,26,0.75)" }}>·</span>
          <span className="text-sm" style={{ color: "rgba(26,26,26,0.75)" }}>Work Location: In person</span>
        </div>
      </Section>

      {/* CTA */}
      <section style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 py-14 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to join the network?</h2>
          <p className="mt-3 text-sm sm:text-base" style={{ color: "rgba(255,251,245,0.7)" }}>
            Apply today and start accepting projects that fit your schedule.
          </p>
          <div className="mt-7">
            <Button
              asChild
              size="lg"
              className="rounded-lg font-semibold"
              style={{ backgroundColor: "#B8956A", color: "#1A1A1A" }}
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