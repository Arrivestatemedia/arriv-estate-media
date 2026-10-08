// Default FAQ content for each public job page type.
// Used both by the public pages (as fallback) and by the EditJobPageModal
// (to pre-populate the FAQ editor when a job has no saved FAQs yet).

export const MEDIA_SPECIALIST_FAQS = [
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

export const MEDIA_SPECIALIST_ATLANTA_FAQS = [
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
    a: "As we launch in Metro Atlanta, we're building out our founding network now. Approved specialists receive opportunities as projects come online in their area.",
  },
];

export const SALES_GROWTH_ADVISOR_FAQS = [
  {
    q: "Is this a salaried position?",
    a: "No. This is a W-2, commission-only position with no guaranteed base salary or draw. Commissions are uncapped and earned on eligible collected revenue.",
  },
  {
    q: "What is the estimated earning range?",
    a: "The estimated monthly commission range is $500–$5,000, based on projected volumes of individual bookings, individual subscriptions, and B2B accounts. Actual earnings depend entirely on individual sales performance, and no minimum earnings are guaranteed.",
  },
  {
    q: "Do I need real estate experience?",
    a: "Experience in real estate, mortgage lending, insurance, advertising, property management, or hospitality sales is especially valuable. Previous experience in sales, account management, business development, or another customer-facing role is expected.",
  },
  {
    q: "Where is this role based?",
    a: "This is a territory-based, field role. About half of your working week is spent in the field meeting prospective customers in person. A typical week includes three field-focused days and one dedicated remote day. This is not a fully remote position.",
  },
  {
    q: "What is the work schedule?",
    a: "Monday through Thursday — a four-day workweek.",
  },
  {
    q: "What does the training cover?",
    a: "Arriv provides 12 hours of paid core onboarding covering our services, pricing, sales processes, technology platform, and customer relationship tools. Representatives also receive ongoing coaching, supervised selling support, and direct access to company leadership.",
  },
  {
    q: "Who will I be selling to?",
    a: "You'll build relationships with real estate agents, brokers, property managers, apartment communities, and developers.",
  },
  {
    q: "What is the commission structure?",
    a: "Our commission structure includes 15% on qualifying individual media bookings, 10% on eligible individual subscription revenue, 60% on eligible B2B implementation fees, 15% on eligible first-month B2B subscription revenue, and 8% on eligible recurring B2B subscription revenue thereafter. Commissions are earned on eligible collected revenue and governed by the written commission agreement.",
  },
];

export const PUBLIC_JOB_PAGE_FAQS = [
  { q: "Is this full-time?", a: "This is an independent contractor role. You choose which projects to accept, so you can work as much or as little as fits your schedule." },
  { q: "Do I need experience?", a: "Relevant experience is preferred but not always required. We provide training and onboarding to set you up for success." },
  { q: "How do I get paid?", a: "You're paid based on the services requested for each project. Payouts are issued after the project is completed and delivered." },
  { q: "Can I keep my existing clients?", a: "Absolutely. There's no exclusivity. Arriv projects are meant to fill the gaps in your schedule while you keep growing your own business." },
  { q: "Where is this role based?", a: "See the location details in the hero section above. We're expanding our network and looking for professionals in the specified area." },
  { q: "How quickly will projects become available?", a: "As we launch in your area, we're building out our network now. Approved professionals receive opportunities as projects come online." },
];

// Determine which default FAQ set applies to a given job opening.
// Falls back to the generic public-job-page set for dynamic /careers/ pages.
export function getDefaultFaqsForJob(jobOpening = {}) {
  const source = (jobOpening.source_url || jobOpening.public_slug || "").toLowerCase();
  if (source.includes("mediaspecialistatl") || source.includes("atlanta")) {
    return MEDIA_SPECIALIST_ATLANTA_FAQS;
  }
  if (source.includes("mediaspecialist")) {
    return MEDIA_SPECIALIST_FAQS;
  }
  if (source.includes("salesgrowthadvisor") || source.includes("sales")) {
    return SALES_GROWTH_ADVISOR_FAQS;
  }
  return PUBLIC_JOB_PAGE_FAQS;
}