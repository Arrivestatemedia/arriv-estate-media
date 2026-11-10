import React from "react";
import { Link } from "react-router-dom";
import SeoPropertyDraftCard from "@/components/property/SeoPropertyDraftCard";
import {
  Camera,
  Images,
  Home,
  TrendingUp,
  ReceiptText,
  Wallet,
  Upload,
  Film,
  Settings,
  ArrowUpRight,
} from "lucide-react";

/**
 * The customer's service directory.
 *
 * It only links to screens that already exist — no service is duplicated here, and nothing is
 * decided client-side: the Studio card appears from the same cached entitlement the navigation
 * uses, and MLS only appears once a delivered gallery exists, because MLS publishing starts from
 * a delivered media job.
 */
const SERVICES = [
  {
    key: "book",
    title: "Book Photography / Video",
    description: "Request a shoot for a new property.",
    icon: Camera,
    to: "/BookingPage",
    always: true,
  },
  {
    key: "bookings",
    title: "My Bookings & Galleries",
    description: "Your shoot requests and the media we delivered.",
    icon: Images,
    anchor: "bookings",
    always: true,
  },
  {
    key: "properties",
    title: "My Properties & SEO",
    description: "Property pages, search visibility and buyer leads.",
    icon: Home,
    to: "/PropertyLeads",
    always: true,
  },
  {
    key: "visibility",
    title: "Advertising & Profiles",
    description: "Your agent or brokerage page, plans and property advertising.",
    icon: TrendingUp,
    to: "/VisibilityDashboard#visibility",
    always: true,
  },
  {
    key: "invoices",
    title: "Invoices & Payments",
    description: "What you have been billed and what is outstanding.",
    icon: ReceiptText,
    anchor: "invoices",
    always: true,
  },
  {
    key: "prepaid",
    title: "Prepaid & Auto-Fund",
    description: "Prepay for media and manage automatic funding.",
    icon: Wallet,
    choices: [
      { label: "Prepaid packages", to: "/PrepaidPurchase" },
      { label: "Auto-Fund", to: "/AutoFund" },
    ],
    always: true,
  },
  {
    key: "mls",
    title: "MLS Publishing",
    description: "Publish a delivered gallery to your eligible MLS.",
    icon: Upload,
    anchor: "galleries",
    requiresMedia: true,
  },
  {
    key: "studio",
    title: "Studio",
    description: "Your design and marketing workspace.",
    icon: Film,
    to: "/StudioWorkspace",
    requiresStudio: true,
  },
  {
    key: "settings",
    title: "Account Settings",
    description: "Your details, password and notification preferences.",
    icon: Settings,
    to: "/PublicAccountSettings",
    always: true,
  },
];

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ServiceCard({ service }) {
  const Icon = service.icon;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-full bg-[#B8956A]/12 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-[#B8956A]" />
        </div>
        <ArrowUpRight className="w-4 h-4 text-[#1A1A1A]/25 group-hover:text-[#B8956A] transition-colors" />
      </div>
      <p className="mt-4 font-semibold text-[var(--text-primary)] leading-snug">{service.title}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">{service.description}</p>
    </>
  );

  const className =
    "group text-left rounded-2xl border border-[#B8956A]/25 bg-[var(--card-bg)] p-5 transition-all hover:border-[#B8956A] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B8956A]";

  // A service with two funding routes lets the customer pick, instead of landing them on one page.
  if (service.choices) {
    return (
      <div className={className}>
        {body}
        <div className="mt-3 flex flex-wrap gap-2">
          {service.choices.map((choice) => (
            <Link
              key={choice.to}
              to={choice.to}
              className="rounded-full border border-[#B8956A]/40 px-3 py-1.5 text-xs font-semibold text-[#1A1A1A]/75 hover:bg-[#B8956A]/10 hover:text-[#1A1A1A]"
            >
              {choice.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (service.to) {
    return (
      <Link to={service.to} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => scrollToId(service.anchor)} className={className}>
      {body}
    </button>
  );
}

export default function ClientPortalServices({ studioActive = false, hasMedia = false }) {
  const services = SERVICES.filter((service) => {
    if (service.requiresStudio) return !!studioActive;
    if (service.requiresMedia) return !!hasMedia;
    return true;
  });

  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-4">
        What would you like to do?
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => (
          <ServiceCard key={service.key} service={service} />
        ))}
      </div>
      <SeoPropertyDraftCard />
    </section>
  );
}