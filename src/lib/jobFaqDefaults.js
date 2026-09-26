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
    a: "No. This is a commission-based W-2 position. Your earning potential is uncapped — your income is directly tied to the relationships you build and the revenue you generate.",
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