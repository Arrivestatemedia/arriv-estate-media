import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Check,
  Home,
  Inbox,
  Megaphone,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

// Public landing page for the free property page. It exists to answer three questions before a realtor
// hands over an email address: what this is, why it is free, and what happens after they click.
// Every call to action goes to one place: the account form, which hands them into the normal portal.

const INCLUDED = [
  "A page for one property on your own link you can send, post and print",
  "Search title, description and structured data written for how buyers actually search",
  "Your photographs in the order you choose, with a cover shot you pick",
  "An inquiry form that emails the lead straight to you, with the source it came from",
  "View counts by day and by channel, so you can see what is working",
];

const STEPS = [
  {
    icon: Home,
    title: "Create your profile",
    body: "Name, email, phone, password. That is your account, and it is what the portal signs you into.",
  },
  {
    icon: Search,
    title: "Add your listing",
    body: "Address, price, beds, baths, the details you already have. We build the page and its search copy.",
  },
  {
    icon: ShieldCheck,
    title: "Review, approve, publish",
    body: "Nothing goes live until you approve the page yourself. You can unpublish it any time.",
  },
];

const WHY_FREE = [
  {
    icon: Megaphone,
    title: "The listing needs its own address",
    body: "A portal listing is one of forty on a results page. A property page is yours to send in a text, drop in a sign rider QR code, or put behind a paid ad.",
  },
  {
    icon: Inbox,
    title: "Leads that arrive with context",
    body: "Every inquiry is routed to you and tagged with the channel it came from, so you know whether it came from a flyer, an email or an ad.",
  },
  {
    icon: BarChart3,
    title: "A real reason to keep going",
    body: "The page is free because the marketing is not the business model — the media, the promotion days and the ad campaigns are. Use the page, and use them only when you need them.",
  },
];

export default function FreePropertyPage() {
  const signupHref = "/ClientSignup?intent=free-page";

  return (
    <div className="min-h-screen bg-[#FFFBF5] text-[#1A1A1A]">
      <header className="sticky top-0 z-40 border-b border-[#B8956A]/20 bg-[#FFFBF5]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png"
              alt="Arriv Estate Media"
              className="h-8"
            />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/SignIn"
              className="hidden text-sm font-medium text-[#1A1A1A]/60 hover:text-[#1A1A1A] sm:block"
            >
              Log in
            </Link>
            <Link
              to={signupHref}
              className="rounded-full bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1A1A1A]/90"
            >
              Create your free page
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 lg:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#B8956A]/30 bg-white px-3 py-1.5 text-xs font-semibold tracking-wide text-[#B8956A] uppercase">
                <Sparkles className="h-3.5 w-3.5" /> Free for one property
              </span>
              <h1 className="mt-6 font-serif text-4xl leading-[1.08] tracking-tight text-[#1A1A1A] sm:text-5xl lg:text-6xl">
                Your listing deserves more than one line on a portal.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#1A1A1A]/65">
                A property page is a dedicated page for a single home: your photographs, the facts buyers
                ask about, and an inquiry form that reaches you. You do not need to have shot with us to
                have one, and the page itself costs nothing.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to={signupHref}
                  className="inline-flex items-center gap-2 rounded-full bg-[#B8956A] px-6 py-3.5 text-base font-semibold text-[#1A1A1A] shadow-lg shadow-[#B8956A]/25 hover:bg-[#A68559]"
                >
                  Create your free page <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 rounded-full border border-[#1A1A1A]/15 px-6 py-3.5 text-base font-semibold text-[#1A1A1A]/75 hover:border-[#B8956A]/50 hover:text-[#1A1A1A]"
                >
                  See how it works
                </a>
              </div>
              <p className="mt-4 text-sm text-[#1A1A1A]/45">
                No card required. Your page is reviewed by our team before it publishes.
              </p>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-3xl border border-[#B8956A]/25 shadow-2xl shadow-[#1A1A1A]/10">
                <img
                  src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80"
                  alt="A modern home exterior"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <div className="absolute -bottom-6 left-4 right-4 rounded-2xl border border-[#1A1A1A]/10 bg-white p-4 shadow-xl shadow-[#1A1A1A]/10 sm:left-8 sm:right-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B8956A]">
                  What a visitor sees
                </p>
                <p className="mt-1 font-serif text-lg text-[#1A1A1A]">1428 Maple Ridge Drive</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#1A1A1A]/60">
                  <span className="rounded-full bg-[#FFFBF5] px-2.5 py-1">4 bed</span>
                  <span className="rounded-full bg-[#FFFBF5] px-2.5 py-1">3 bath</span>
                  <span className="rounded-full bg-[#FFFBF5] px-2.5 py-1">2,860 sq ft</span>
                  <span className="rounded-full bg-[#FFFBF5] px-2.5 py-1">$715,000</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why it exists */}
        <section className="border-y border-[#1A1A1A]/5 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="max-w-2xl font-serif text-3xl text-[#1A1A1A] sm:text-4xl">
              Why we give this away
            </h2>
            <p className="mt-3 max-w-2xl text-[#1A1A1A]/60">
              Because the page is the part that should never be a decision. Everything else here is
              optional and priced on its own.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {WHY_FREE.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-[#1A1A1A]/8 bg-[#FFFBF5] p-6"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#B8956A]/15">
                      <Icon className="h-5 w-5 text-[#B8956A]" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-[#1A1A1A]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#1A1A1A]/60">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* What you get */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="font-serif text-3xl text-[#1A1A1A] sm:text-4xl">What comes with it</h2>
              <p className="mt-3 text-[#1A1A1A]/60">
                One property page, built and hosted by us, at no cost and with no time limit.
              </p>
              <ul className="mt-8 space-y-4">
                {INCLUDED.map((line) => (
                  <li key={line} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#B8956A]/15">
                      <Check className="h-3.5 w-3.5 text-[#B8956A]" />
                    </span>
                    <span className="text-[#1A1A1A]/75">{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-[#B8956A]/25 bg-white p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#B8956A]">
                When you want more
              </p>
              <h3 className="mt-2 font-serif text-2xl text-[#1A1A1A]">
                Optional, itemised, and never bundled in quietly
              </h3>
              <div className="mt-6 space-y-4 text-sm">
                <div className="flex items-start justify-between gap-4 border-b border-[#1A1A1A]/5 pb-4">
                  <div>
                    <p className="font-semibold text-[#1A1A1A]">Professional photography</p>
                    <p className="text-[#1A1A1A]/55">Shot by an Arriv media partner, edited and delivered.</p>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-4 border-b border-[#1A1A1A]/5 pb-4">
                  <div>
                    <p className="font-semibold text-[#1A1A1A]">Promotion days</p>
                    <p className="text-[#1A1A1A]/55">Featured placement on our own property directory.</p>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-[#1A1A1A]">Ad campaigns</p>
                    <p className="text-[#1A1A1A]/55">Managed advertising to buyers in your market.</p>
                  </div>
                </div>
              </div>
              <p className="mt-6 text-xs leading-relaxed text-[#1A1A1A]/45">
                Nothing is charged when you create the page. You will only ever pay for something you
                choose and confirm on its own screen.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-[#1A1A1A]/5 bg-[#1A1A1A]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-serif text-3xl text-[#FFFBF5] sm:text-4xl">Three steps, then it is live</h2>
            <p className="mt-3 max-w-2xl text-[#FFFBF5]/60">
              You create an account because the page has to belong to someone, and because that account is
              how you will come back to it, get leads and manage everything else.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.title}
                    className="rounded-2xl border border-[#FFFBF5]/10 bg-[#242424] p-6"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#B8956A] text-sm font-bold text-[#1A1A1A]">
                        {index + 1}
                      </span>
                      <Icon className="h-5 w-5 text-[#B8956A]" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-[#FFFBF5]">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#FFFBF5]/60">{step.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Plain terms */}
        <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="font-serif text-2xl text-[#1A1A1A]">Straight answers</h2>
          <div className="mt-8 space-y-6">
            <div>
              <h3 className="font-semibold text-[#1A1A1A]">Do I have to book a shoot?</h3>
              <p className="mt-1 text-[#1A1A1A]/60">
                No. The page is yours to start today. Photography is a separate service you can add
                whenever it suits the listing.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#1A1A1A]">Who publishes it?</h3>
              <p className="mt-1 text-[#1A1A1A]/60">
                You do. We build the page and review it, then it goes live only after you approve the
                content and the media, and it carries your name, brokerage and contact details.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#1A1A1A]">Does this replace my MLS listing?</h3>
              <p className="mt-1 text-[#1A1A1A]/60">
                No. This is marketing that points at your listing. It does not list the property on any
                MLS and does not make Arriv your broker.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#1A1A1A]">Will it rank on Google?</h3>
              <p className="mt-1 text-[#1A1A1A]/60">
                It is built to be found: real headings, real facts, fast rendering and structured data.
                We do not promise a position in search results.
              </p>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-[#B8956A]/20 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <h2 className="font-serif text-3xl text-[#1A1A1A] sm:text-4xl">
              Start with the property you are working hardest.
            </h2>
            <p className="mt-3 text-[#1A1A1A]/60">
              Create your profile, add the listing, approve the page. It takes a few minutes and costs
              nothing.
            </p>
            <Link
              to={signupHref}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#B8956A] px-7 py-4 text-base font-semibold text-[#1A1A1A] shadow-lg shadow-[#B8956A]/25 hover:bg-[#A68559]"
            >
              Create your free page <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-4 text-sm text-[#1A1A1A]/45">
              Already have an account?{" "}
              <Link to="/SignIn" className="font-semibold text-[#B8956A] hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#1A1A1A]/5 bg-[#FFFBF5]">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs leading-relaxed text-[#1A1A1A]/45 sm:px-6">
          <p>
            Arriv Estate Media provides real estate media and marketing services. Property pages are
            published on behalf of the listing contact named on the page. All properties are advertised
            without discrimination on the basis of race, color, religion, sex, handicap, familial status
            or national origin (Fair Housing Act).
          </p>
          <p className="mt-3">
            <Link to="/PrivacyPolicy" className="text-[#B8956A] hover:underline">
              Privacy Policy
            </Link>
            <span className="mx-2">·</span>
            <Link to="/ClientTermsConditions" className="text-[#B8956A] hover:underline">
              Terms &amp; Conditions
            </Link>
            <span className="mx-2">·</span>
            <Link to="/properties" className="text-[#B8956A] hover:underline">
              Browse properties
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}