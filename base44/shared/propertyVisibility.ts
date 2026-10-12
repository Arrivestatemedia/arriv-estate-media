// Property Visibility v1.0 — shared engine.
//
// Every rule that decides whether a property page may exist, be approved, be published or be
// shown as available lives here, so the customer builder, the public page, the directory
// search and the certification suite all apply exactly the same policy.

export const PROPERTY_FEATURE_FLAG_KEY = "PROPERTY_VISIBILITY_ENABLED";

// ---------------------------------------------------------------------------
// Feature flag — the whole feature is dark until this reads "true".
// ---------------------------------------------------------------------------
export async function isPropertyVisibilityEnabled(client: any): Promise<boolean> {
  try {
    const rows = await client.asServiceRole.entities.AppSetting.filter({
      key: PROPERTY_FEATURE_FLAG_KEY,
    });
    const list = Array.isArray(rows) ? rows : (rows?.items || []);
    return String(list?.[0]?.value ?? "false").toLowerCase() === "true";
  } catch {
    // Fail closed: an unreadable flag never enables a public surface.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Certification test mode — the SAFE substitute for temporarily setting the
// production feature flag to "true" while a test suite ran.
//
// Test mode requires ALL THREE of the following, so it can never reach production traffic:
//   1. the environment variable PROPERTY_VISIBILITY_TEST_MODE is exactly "true"
//      (a certification-only configuration; deliberately absent in production),
//   2. the individual request opts in explicitly with `test_mode: true`,
//   3. every record involved is a certification record (certification_mode === true).
//
// Consequences that make it safe by construction:
//   * production traffic never sends `test_mode`, so behaviour is unchanged;
//   * a real customer listing can NEVER be reached in test mode (only certification records
//     are in scope), and a certification record can never be reached in normal mode;
//   * the production feature flag is never written by any test.
export const PROPERTY_TEST_MODE_ENV = "PROPERTY_VISIBILITY_TEST_MODE";

export function certificationTestModeAvailable(): boolean {
  try {
    const raw = (globalThis as any)?.process?.env?.[PROPERTY_TEST_MODE_ENV];
    return String(raw ?? "false").trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

export function testModeRequested(input: unknown): boolean {
  return input === true || String(input ?? "").trim().toLowerCase() === "true";
}

export interface FeatureGate {
  enabled: boolean;
  test_mode: boolean;
}

// Resolves the gate for one request. The production flag always wins; test mode is a
// fallback that only exists when the certification configuration is present.
export async function resolveFeatureGate(client: any, requested: boolean): Promise<FeatureGate> {
  if (await isPropertyVisibilityEnabled(client)) return { enabled: true, test_mode: false };
  if (requested === true && certificationTestModeAvailable()) return { enabled: true, test_mode: true };
  return { enabled: false, test_mode: false };
}

// The certification_mode filter to apply to a query: test mode sees certification records
// only, normal mode sees everything except them.
export function certificationScope(testMode: boolean): any {
  return testMode ? true : { $ne: true };
}

// Whether a loaded record is in scope for this gate. Both directions are enforced, so a
// test-mode request can never read a real listing and a normal request can never read a
// synthetic one.
export function recordInScope(record: any, testMode: boolean): boolean {
  const isCertification = record?.certification_mode === true;
  return testMode ? isCertification : !isCertification;
}

// ---------------------------------------------------------------------------
// Publication state machine
// ---------------------------------------------------------------------------
export const PUBLICATION_STATES = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "UNPUBLISHED",
  "ARCHIVED",
] as const;

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["READY_FOR_REVIEW", "ARCHIVED"],
  READY_FOR_REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED: ["PUBLISHED", "READY_FOR_REVIEW", "ARCHIVED"],
  PUBLISHED: ["UNPUBLISHED", "ARCHIVED"],
  UNPUBLISHED: ["PUBLISHED", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] || []).includes(to);
}

export function transitionError(from: string, to: string): string | null {
  if (!PUBLICATION_STATES.includes(to as any)) return `Unknown publication state: ${to}`;
  if (!canTransition(from, to)) return `Invalid publication transition ${from} → ${to}`;
  return null;
}

// ---------------------------------------------------------------------------
// Delivery eligibility — the SAME rule the existing client gallery uses. Not changed.
// ---------------------------------------------------------------------------
export const ELIGIBLE_PRODUCTION_STATUSES = ["delivered", "ready_for_delivery", "no_editing_required"];

export function isJobEligibleForPropertyPage(job: any): { eligible: boolean; reason?: string } {
  if (!job) return { eligible: false, reason: "JOB_NOT_FOUND" };
  if (!ELIGIBLE_PRODUCTION_STATUSES.includes(job.production_status)) {
    return { eligible: false, reason: "MEDIA_NOT_DELIVERED" };
  }
  return { eligible: true };
}

// ---------------------------------------------------------------------------
// Listing availability policy
//
// Where no authoritative status feed exists, a listing must be reconfirmed. The window and
// the consequences are declared here so the policy is documented, not implied:
//   * <= 30 days since confirmation  → shown as available
//   * >  30 days, <= 60 days         → immediately removed from active results, confirmed flagged
//   * >  60 days                     → automatically deactivated (publication state moved out
//                                      of PUBLISHED by the lifecycle sweep)
// A sold, withdrawn or expired listing is NEVER presented as available, regardless of window.
// ---------------------------------------------------------------------------
export const STATUS_CONFIRMATION_WINDOW_DAYS = 30;
export const STATUS_AUTO_DEACTIVATE_AFTER_DAYS = 60;
export const AVAILABLE_LISTING_STATUSES = ["active", "pending"];

function daysSince(iso: string | undefined, now: Date): number {
  const t = Date.parse(String(iso || ""));
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / 86400000;
}

export function isPubliclyActive(listing: any, now = new Date()): boolean {
  if (!listing || listing.certification_mode === true) return false;
  if (listing.publication_state !== "PUBLISHED") return false;
  if (!AVAILABLE_LISTING_STATUSES.includes(listing.listing_status)) return false;
  const reference = listing.last_status_confirmed_at || listing.published_at;
  if (daysSince(reference, now) > STATUS_CONFIRMATION_WINDOW_DAYS) return false;
  return true;
}

export function needsStatusConfirmation(listing: any, now = new Date()): boolean {
  if (listing?.publication_state !== "PUBLISHED") return false;
  const reference = listing?.last_status_confirmed_at || listing?.published_at;
  return daysSince(reference, now) > STATUS_CONFIRMATION_WINDOW_DAYS;
}

export function shouldAutoDeactivate(listing: any, now = new Date()): boolean {
  if (listing?.publication_state !== "PUBLISHED") return false;
  if (!AVAILABLE_LISTING_STATUSES.includes(listing?.listing_status)) return false;
  const reference = listing?.last_status_confirmed_at || listing?.published_at;
  return daysSince(reference, now) > STATUS_AUTO_DEACTIVATE_AFTER_DAYS;
}

export function nextConfirmationDue(from = new Date()): string {
  return new Date(from.getTime() + STATUS_CONFIRMATION_WINDOW_DAYS * 86400000).toISOString();
}

// A listing reachable at its public URL but not shown as available (sold / withdrawn / expired).
export function isPubliclyReachable(listing: any): boolean {
  return !!listing && listing.certification_mode !== true && listing.publication_state === "PUBLISHED";
}

// ---------------------------------------------------------------------------
// URLs, slugs and duplicate prevention
// ---------------------------------------------------------------------------
export function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 70);
}

export function buildSlug(address: string, city: string, state: string, listingId: string): string {
  const parts = [slugify(address), slugify(city), slugify(state)].filter(Boolean);
  const suffix = String(listingId || "").replace(/^prop_/, "").slice(0, 8);
  return [...parts, suffix].filter(Boolean).join("-");
}

export function publicOrigin(): string {
  const configured = (globalThis as any)?.process?.env?.BASE44_APP_DOMAIN;
  const raw = String(configured || "https://arrivestatemedia.base44.app").trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export function propertyPageUrl(slug: string): string {
  return `${publicOrigin()}/properties/${slug}`;
}

export function mediaStreamUrl(listingId: string, fileId: string): string {
  return `${publicOrigin()}/functions/streamPropertyMedia?listing=${encodeURIComponent(listingId)}&file=${encodeURIComponent(fileId)}`;
}

// Deterministic key that stops a second page being created for the same job/property.
export function duplicateKey(jobId: string, address: string): string {
  return `${String(jobId || "").trim()}::${slugify(address)}`;
}

export function normalizeAddress(address: string): string {
  return String(address || "").trim().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Content hashing — SEO is generated once and regenerated only on real change.
// ---------------------------------------------------------------------------
function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Inputs that actually affect the published content. A change here — and only here — justifies
// regenerating SEO content.
export function seoSourceHash(listing: any): Promise<string> {
  return sha256Hex(
    stableStringify({
      address: listing?.property_address || "",
      city: listing?.city || "",
      state: listing?.state || "",
      zip: listing?.zip || "",
      price: listing?.listing_price ?? null,
      beds: listing?.bedrooms ?? null,
      baths: listing?.bathrooms ?? null,
      sqft: listing?.square_footage ?? null,
      type: listing?.property_type || "",
      status: listing?.listing_status || "",
      amenities: listing?.amenities || [],
      media: (listing?.selected_media || []).map((m: any) => `${m?.kind}:${m?.drive_file_id}:${m?.position}`),
      description: listing?.property_description || "",
    }),
  );
}

export function contentHash(listing: any): Promise<string> {
  return seoSourceHash(listing);
}

// ---------------------------------------------------------------------------
// SEO content (AI drafts). Drafts only — approval is always a human action.
// ---------------------------------------------------------------------------
const CONTENT_SCHEMA = {
  type: "object",
  properties: {
    property_description: { type: "string" },
    seo_title: { type: "string" },
    meta_description: { type: "string" },
    alt_texts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          drive_file_id: { type: "string" },
          alt_text: { type: "string" },
        },
        required: ["drive_file_id", "alt_text"],
      },
    },
  },
  required: ["property_description", "seo_title", "meta_description", "alt_texts"],
};

export async function generateSeoDraft(client: any, listing: any) {
  const photos = (listing?.selected_media || []).filter((m: any) => m?.kind === "photo");
  const facts = {
    address: listing?.property_address || "",
    city: listing?.city || "",
    state: listing?.state || "",
    zip: listing?.zip || "",
    price: listing?.listing_price ?? null,
    bedrooms: listing?.bedrooms ?? null,
    bathrooms: listing?.bathrooms ?? null,
    square_footage: listing?.square_footage ?? null,
    property_type: listing?.property_type || "",
    amenities: listing?.amenities || [],
    listing_status: listing?.listing_status || "",
    brokerage: listing?.brokerage_name || "",
    photos: photos.map((p: any) => ({ drive_file_id: p.drive_file_id, name: p.name })),
  };

  const prompt = [
    "You are writing draft marketing content for a real-estate property page for Arriv Estate Media.",
    "Use ONLY the facts supplied below. Never invent a fact, a feature, a dimension, a school, a neighbourhood claim or a price.",
    "Any field that is null or empty must simply be omitted from the description — do not guess it.",
    "Write a factual, professional property description of 90-150 words.",
    "Write a search-friendly page title of at most 60 characters that includes the city and state.",
    "Write a unique meta description of 120-155 characters that summarises the property factually.",
    "Write descriptive alt text (max 125 characters) for each photo, describing the room or view implied by its file name, without inventing details you cannot support.",
    "This is a DRAFT that a human will review and may edit, so keep it sober and accurate.",
    `FACTS: ${JSON.stringify(facts)}`,
  ].join("\n");

  const result = await client.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: CONTENT_SCHEMA,
  });
  return result;
}

export function buildStructuredData(listing: any, url: string) {
  const data: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing?.seo_title || listing?.property_address || "Property",
    url,
    description: listing?.meta_description || listing?.property_description || "",
  };
  if (listing?.listing_price != null) {
    data.offers = { "@type": "Offer", price: listing.listing_price, priceCurrency: "USD" };
  }
  const address: Record<string, any> = {
    "@type": "PostalAddress",
    streetAddress: listing?.property_address || "",
    addressLocality: listing?.city || "",
    addressRegion: listing?.state || "",
    postalCode: listing?.zip || "",
    addressCountry: "US",
  };
  data.address = address;
  if (listing?.bedrooms != null || listing?.bathrooms != null || listing?.square_footage != null) {
    data.additionalProperty = [];
    if (listing?.bedrooms != null) {
      data.additionalProperty.push({ "@type": "PropertyValue", name: "Bedrooms", value: listing.bedrooms });
    }
    if (listing?.bathrooms != null) {
      data.additionalProperty.push({ "@type": "PropertyValue", name: "Bathrooms", value: listing.bathrooms });
    }
    if (listing?.square_footage != null) {
      data.additionalProperty.push({ "@type": "PropertyValue", name: "Square footage", value: listing.square_footage });
    }
  }
  if (listing?.agent_name) {
    data.agent = {
      "@type": "RealEstateAgent",
      name: listing.agent_name,
      ...(listing.brokerage_name ? { memberOf: { "@type": "Organization", name: listing.brokerage_name } } : {}),
    };
  }
  return data;
}

// ---------------------------------------------------------------------------
// Disclosures
// ---------------------------------------------------------------------------
export const PUBLICATION_CONSENT_TEXT =
  "I confirm I am authorized to advertise this property, that the details and media I am approving are accurate, that applicable brokerage approval has been obtained, and I consent to this property page being published publicly on Arriv Estate Media. I understand I can unpublish it at any time.";

export const ADVERTISING_DISCLOSURES = [
  "This property page is published by Arriv Estate Media on behalf of the listing agent named on the page.",
  "Property details are supplied by the listing agent or property owner and are not independently verified by Arriv Estate Media.",
  "All inquiries are routed to the listing contact named on this page. Arriv Estate Media does not act as a real estate broker or agent for this property.",
  "All properties are advertised without discrimination on the basis of race, color, religion, sex, handicap, familial status or national origin (Fair Housing Act).",
  "Arriv Estate Media does not guarantee search-engine ranking or placement.",
];

export const INQUIRY_PRIVACY_DISCLOSURES = [
  "Your message is sent only to the listing contact shown on this page.",
  "Your details are used to respond to this specific property inquiry.",
  "Inquiry records are retained for audit and abuse-prevention purposes.",
  "Arriv Estate Media does not sell inquiry data.",
];

export const INQUIRY_CONSENT_TEXT =
  "I consent to being contacted about this property and I have read the privacy disclosures above.";

// ---------------------------------------------------------------------------
// Cost model — incremental operating cost per published property.
//
// The design intentionally avoids the two costs that dominate a listing platform:
//   * media duplication  — nothing is copied; selected assets are streamed from the job's
//                          existing private Drive folder through an allow-listed endpoint.
//   * recurring AI       — SEO content is generated once per content change (hash gated).
// Figures are the documented unit estimates used for planning, not billed amounts.
// ---------------------------------------------------------------------------
export const COST_MODEL = {
  usd_per_ai_content_generation: 0.02,
  usd_per_gb_storage_month: 0.021,
  usd_per_10k_media_stream_responses: 0.9,
  usd_per_10k_page_views: 0.35,
  usd_per_10k_directory_searches: 0.25,
  assumed_monthly_page_views_per_listing: 150,
  assumed_monthly_inquiries_per_listing: 2,
  assumed_monthly_directory_searches_per_listing: 20,
  media_duplication_gb: 0,
};

export function estimateCostPerProperty(listing?: any) {
  const generations = listing?.ai_generation_count ?? 1;
  const ai = generations * COST_MODEL.usd_per_ai_content_generation;
  const views = COST_MODEL.assumed_monthly_page_views_per_listing / 10000;
  const hosting = views * COST_MODEL.usd_per_10k_page_views;
  const bandwidth = views * COST_MODEL.usd_per_10k_media_stream_responses;
  const searches = COST_MODEL.assumed_monthly_directory_searches_per_listing / 10000;
  const search = searches * COST_MODEL.usd_per_10k_directory_searches;
  const storage = COST_MODEL.media_duplication_gb * COST_MODEL.usd_per_gb_storage_month;
  const monthly = ai + hosting + bandwidth + search + storage;
  return {
    currency: "USD",
    one_time_ai_content: Number(ai.toFixed(4)),
    monthly_hosting: Number(hosting.toFixed(4)),
    monthly_bandwidth: Number(bandwidth.toFixed(4)),
    monthly_directory_and_search: Number(search.toFixed(4)),
    monthly_storage_duplication: Number(storage.toFixed(4)),
    monthly_total: Number(monthly.toFixed(4)),
    annual_total: Number((monthly * 12).toFixed(4)),
    assumptions: {
      media_duplicated: false,
      ai_generations_assumed: generations,
      monthly_page_views_assumed: COST_MODEL.assumed_monthly_page_views_per_listing,
    },
  };
}

// ---------------------------------------------------------------------------
// RESO-aligned projection (reserved for a future MLS/IDX integration)
// ---------------------------------------------------------------------------
export function resoProjection(listing: any) {
  const standardStatus =
    listing?.listing_status === "active" ? "Active"
    : listing?.listing_status === "pending" ? "Pending"
    : listing?.listing_status === "sold" ? "Closed"
    : listing?.listing_status === "withdrawn" ? "Withdrawn"
    : listing?.listing_status === "expired" ? "Expired"
    : "ComingSoon";
  return {
    reso_listing_key: listing?.listing_id || "",
    standard_status: standardStatus,
    property_sub_type: listing?.property_type || "",
    listing_service_name: "Arriv Estate Media (non-MLS)",
  };
}

// ---------------------------------------------------------------------------
// Authorization policy (single source of truth for both the API and the tests)
// ---------------------------------------------------------------------------
export interface PropertyActor {
  email?: string;
  isAdmin?: boolean;
  clientEmail?: string;
}

// Who may read or edit a property page: its owning customer, or an admin (who may review a
// page but, by policy, never approve its publication for the customer).
export function canActorAccessListing(listing: any, actor: PropertyActor): boolean {
  if (!listing || !actor) return false;
  if (actor.isAdmin === true) return true;
  const email = String(actor.clientEmail || "").toLowerCase();
  if (!email) return false;
  return String(listing.client_email || "").toLowerCase() === email;
}

// Publication approval is reserved to the authorized customer account.
export function canApprovePublication(actor: PropertyActor): boolean {
  return actor?.isAdmin !== true;
}

// ---------------------------------------------------------------------------
// Media selection normalisation
//
// Only files present in the job's own delivered folder can be selected (the folder listing is
// the allow-list), only photographs and video qualify, positions are renumbered from zero in
// the customer's chosen order, and the cover falls back to the first photograph.
// ---------------------------------------------------------------------------
export function normalizeSelection(items: any[], allowed: Map<string, any>, coverId?: string) {
  const requested = Array.isArray(items) ? items : [];
  const selected = requested
    .slice(0, 200)
    .map((item: any, index: number) => {
      const file = allowed.get(String(item?.drive_file_id || ""));
      if (!file) return null;
      const kind = file.isImage ? "photo" : file.isVideo ? "video" : null;
      if (!kind) return null;
      return {
        drive_file_id: file.id,
        name: sanitizeText(file.name, 200),
        kind,
        alt_text: sanitizeText(item?.alt_text, 200),
        position: Number.isFinite(Number(item?.position)) ? Number(item.position) : index,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.position - b.position)
    .map((m: any, index: number) => ({ ...m, position: index }));

  const chosen = String(coverId || "");
  const cover = selected.some((m: any) => m.drive_file_id === chosen)
    ? chosen
    : (selected.find((m: any) => m.kind === "photo")?.drive_file_id || "");

  return {
    selected,
    cover,
    rejected: requested.length - selected.length,
    photo_count: selected.filter((m: any) => m.kind === "photo").length,
    video_count: selected.filter((m: any) => m.kind === "video").length,
  };
}

// ---------------------------------------------------------------------------
// Certification
// ---------------------------------------------------------------------------
export const CERT_PREFIX = "cert_prop_";

export function certificationListingId(runId: string, n: number) {
  return `${runId}_listing_${n}`;
}

export function sanitizeText(value: unknown, max = 2000): string {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}

export function isValidEmail(value: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value ?? "").trim());
}

export function inquirySpamSignals(input: { name?: string; email?: string; message?: string; honeypot?: string }) {
  const flags: string[] = [];
  const message = String(input.message || "");
  if (String(input.honeypot || "").trim().length > 0) flags.push("honeypot");
  const links = (message.match(/https?:\/\//gi) || []).length;
  if (links > 2) flags.push("excessive_links");
  if (message.length > 0 && message.length < 10) flags.push("too_short");
  if (/\b(viagra|casino|crypto\s+loan|seo\s+services|backlink)\b/i.test(message)) flags.push("known_spam_terms");
  if (/@(mailinator|guerrillamail|10minutemail|tempmail)\b/i.test(String(input.email || ""))) flags.push("disposable_email_domain");
  return { flags, score: flags.length };
}