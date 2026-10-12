import { base44 } from "@/api/base44Client";

// Front-end helpers for Property Visibility. The feature flag is enforced server-side in
// every function, so these wrappers never decide on their own whether the feature is on —
// they surface what the server answers (a disabled surface answers feature_disabled: true).

export const PUBLICATION_STATE_LABELS = {
  DRAFT: "Draft",
  READY_FOR_REVIEW: "Ready for review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  UNPUBLISHED: "Unpublished",
  ARCHIVED: "Archived",
};

export const LISTING_STATUS_LABELS = {
  draft: "Draft",
  active: "Active",
  pending: "Pending",
  sold: "Sold",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

export const AVAILABLE_STATUSES = ["active", "pending"];

export const PUBLICITY_CONSENT_TEXT =
  "I confirm I am authorized to advertise this property, that the details and media I am approving are accurate, that applicable brokerage approval has been obtained, and I consent to this property page being published publicly on Arriv Estate Media. I understand I can unpublish it at any time.";

export const DISCLOSURES = [
  "This property page is published by Arriv Estate Media on behalf of the listing agent named on the page.",
  "Property details are supplied by the listing agent or property owner and are not independently verified by Arriv Estate Media.",
  "All inquiries are routed to the listing contact named on this page. Arriv Estate Media does not act as a real estate broker or agent for this property.",
  "All properties are advertised without discrimination on the basis of race, color, religion, sex, handicap, familial status or national origin (Fair Housing Act).",
  "Arriv Estate Media does not guarantee search-engine ranking or placement.",
];

export const INQUIRY_DISCLOSURES = [
  "Your message is sent only to the listing contact shown on this page.",
  "Your details are used to respond to this specific property inquiry.",
  "Inquiry records are retained for audit and abuse-prevention purposes.",
  "Arriv Estate Media does not sell inquiry data.",
];

export async function propertyAction(action, payload = {}) {
  const res = await base44.functions.invoke("managePropertyListing", { action, ...payload });
  return res?.data || res;
}

export async function loadPropertyContext(jobId, clientEmail) {
  const res = await base44.functions.invoke("managePropertyListing", {
    action: "get_context",
    jobId,
    clientEmail,
  });
  return res?.data || res;
}

export function money(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}