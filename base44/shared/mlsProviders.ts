// mlsProviders.ts
// Provider capability registry for the MLS Publishing Manager.
//
// FMLS is the only provider enabled today. Georgia MLS and Bright MLS are declared but
// disabled: their requirements (limits, formats, virtual-tour handling) are not confirmed,
// so the customer gallery must not offer them. Everything provider-specific — photo limits,
// number format, upload method — is read from here, so adding a provider later is a config
// change plus, at most, a provider-specific administrative panel. The customer gallery does
// not change.
//
// Overrides live in AppSetting under `mls_providers` (a JSON object keyed by provider id) so an
// administrator can change a limit — FMLS documents 200 photos per listing today — without a deploy.

export const MLS_PROVIDERS_KEY = "mls_providers";

/**
 * The four tests an integrated provider must pass before it may serve live customers automatically.
 * An administrator sets these once the provider's own integration testing is complete.
 */
export interface MlsCertification {
  authentication: boolean;
  manifest: boolean;
  media_accessibility: boolean;
  authorized_import: boolean;
}

export interface MlsProvider {
  id: string;
  label: string;
  short_label: string;
  enabled: boolean;
  photo_limit: number;
  supported_photo_formats: string[];
  video_support: "virtual_tour_url" | "none";
  video_requirement_note: string;
  upload_method: "admin_manual_matrix" | "api";
  number_pattern: string;
  number_hint: string;
  requires_authorization: boolean;
  /** FMLS needs the customer's listing number. Bright matches the listing by property address unless it asks for one. */
  requires_listing_number: boolean;
  /** True for providers whose integration must pass certification before it serves customers. */
  requires_certification: boolean;
  certification: MlsCertification;
  /**
   * May this MLS ever be shown to a customer as a publishing destination? False for an integration
   * that is still being built, so it is never advertised as somewhere we can publish.
   */
  advertised: boolean;
  /** Can Arriv actually publish to it today — by hand through our MLS team, or through its API? */
  operational: boolean;
  /**
   * The service area as the MLS itself advertises it. Evidence for evaluating real overlaps when a
   * second MLS in the same state becomes operational — never a routing input, because coverage is
   * mapped jurisdiction by jurisdiction in mlsRegions and an MLS's compulsory listing area is not
   * the same thing as its geographic service area.
   */
  service_area_metadata?: {
    states: string[];
    all_counties?: boolean;
    note?: string;
    source?: { label: string; url?: string; retrieved_at?: string };
  };
}

export const UNCERTIFIED: MlsCertification = {
  authentication: false,
  manifest: false,
  media_accessibility: false,
  authorized_import: false,
};

export const CERTIFIED: MlsCertification = {
  authentication: true,
  manifest: true,
  media_accessibility: true,
  authorized_import: true,
};

/** Every certification test has passed. Providers that need none are always considered passed. */
export function certificationPassed(provider: MlsProvider | null): boolean {
  if (!provider) return false;
  if (!provider.requires_certification) return true;
  const c = provider.certification || UNCERTIFIED;
  return !!(c.authentication && c.manifest && c.media_accessibility && c.authorized_import);
}

/** May this provider's route serve a customer right now, end to end? */
export function isProviderLiveForCustomers(provider: MlsProvider | null): boolean {
  return !!provider && provider.enabled === true && certificationPassed(provider);
}

/**
 * Is this MLS a publishing destination a customer's media may be sent to at all?
 *
 * Distinct from `enabled`, which only switches the automated route on: an MLS can be a real
 * destination we publish to by hand while its API route is still dark. A provider that is still
 * being built (no process behind it yet) is neither advertised nor operational, so no address is
 * ever routed to it — that is what keeps Georgia MLS off the customer experience until it exists.
 */
export function isAdvertisedDestination(provider: MlsProvider | null): boolean {
  return !!provider && provider.advertised === true && provider.operational === true;
}

export const MLS_PROVIDER_DEFAULTS: Record<string, MlsProvider> = {
  fmls: {
    id: "fmls",
    label: "FMLS — First Multiple Listing Service",
    short_label: "FMLS",
    // Real destination: operated by our MLS team through FMLS Matrix today.
    advertised: true,
    operational: true,
    enabled: true,
    photo_limit: 200,
    supported_photo_formats: ["jpg", "jpeg", "png"],
    video_support: "virtual_tour_url",
    video_requirement_note: "FMLS takes video as a virtual tour URL. Arriv supplies the unlisted YouTube link.",
    upload_method: "admin_manual_matrix",
    number_pattern: "^\\d{6,9}$",
    number_hint: "6 to 9 digits, as shown in FMLS Matrix",
    requires_authorization: true,
    requires_listing_number: true,
    requires_certification: false,
    certification: CERTIFIED,
    service_area_metadata: {
      states: ["GA"],
      all_counties: true,
      note:
        "Members in every Georgia county, so the geographic service area is mapped state-wide. The " +
        "compulsory listing area is narrower and is stored as region metadata (compulsory_counties).",
      source: { label: "First Multiple Listing Service", url: "https://firstmls.com/about/", retrieved_at: "2026-11-09" },
    },
  },
  georgia_mls: {
    id: "georgia_mls",
    label: "Georgia MLS",
    short_label: "Georgia MLS",
    // Not a destination yet: no integration and no process behind it. Turning both flags on (and
    // adding its service area) is all it takes to offer it — the customer experience does not change.
    advertised: false,
    operational: false,
    enabled: false,
    photo_limit: 100,
    supported_photo_formats: ["jpg", "jpeg", "png"],
    video_support: "virtual_tour_url",
    video_requirement_note: "Integration and provider requirements pending confirmation.",
    upload_method: "admin_manual_matrix",
    number_pattern: "^\\d{6,10}$",
    number_hint: "Listing number as shown in Georgia MLS",
    requires_authorization: true,
    requires_listing_number: true,
    requires_certification: true,
    certification: UNCERTIFIED,
    service_area_metadata: {
      states: ["GA"],
      all_counties: true,
      note:
        "Advertises coverage in all 159 Georgia counties. Recorded as advertised coverage only — it is " +
        "not routed to and not compared against FMLS until Georgia MLS is operational, at which point " +
        "the real overlapping coverage decides what the customer is offered.",
      source: { label: "Georgia MLS", retrieved_at: "2026-11-09" },
    },
  },
  bright_mls: {
    id: "bright_mls",
    label: "Bright MLS",
    short_label: "Bright MLS",
    // Real destination: our MLS team works these requests by hand until the route is activated.
    advertised: true,
    operational: true,
    enabled: false,
    photo_limit: 100,
    supported_photo_formats: ["jpg", "jpeg", "png"],
    video_support: "virtual_tour_url",
    video_requirement_note: "Bright takes the tour as a link. Arriv supplies the unlisted YouTube URL.",
    upload_method: "api",
    number_pattern: "^[A-Za-z0-9-]{4,20}$",
    number_hint: "Bright listing number, only if Bright asks you for one",
    requires_authorization: true,
    requires_listing_number: false,
    // Bright Media Sync stays dark until authentication, manifest, media-accessibility and
    // authorized-import testing have all passed. Until then requests are handled by hand.
    //
    // Status on 2026-11-09 (see base44/BRIGHT_MLS_CERTIFICATION_STATUS.md): authentication, basic
    // manifest acceptance and the MLS-login redirect were verified through Bright's Code Playground,
    // but Bright fetching our signed media and an agent completing the import are NOT yet verified,
    // so every switch below stays off and the route is not live for customers.
    requires_certification: true,
    certification: UNCERTIFIED,
  },
};

/** Providers merged with any AppSetting overrides. Disabled providers stay visible to admins only. */
export async function loadMlsProviders(base44: any): Promise<Record<string, MlsProvider>> {
  const merged: Record<string, MlsProvider> = {};
  Object.values(MLS_PROVIDER_DEFAULTS).forEach((p) => { merged[p.id] = { ...p }; });
  try {
    const rows = await base44.asServiceRole.entities.AppSetting.filter({ key: MLS_PROVIDERS_KEY }, undefined, 1);
    const raw = rows?.[0]?.value;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      Object.keys(parsed || {}).forEach((id) => {
        if (!merged[id]) return;
        const override = parsed[id] || {};
        merged[id] = {
          ...merged[id],
          ...override,
          id,
        };
      });
    }
  } catch {
    // A malformed override must never block the feature — defaults stand.
  }
  return merged;
}

export function enabledProviders(providers: Record<string, MlsProvider>): MlsProvider[] {
  return Object.values(providers).filter((p) => p.enabled);
}

export function getProvider(providers: Record<string, MlsProvider>, id: string): MlsProvider | null {
  const provider = providers[String(id || "").trim().toLowerCase()];
  return provider || null;
}

/** Digits/hyphens/letters only, trimmed and upper-cased for alphanumeric providers. */
export function normalizeMlsNumber(provider: MlsProvider | null, raw: string): string {
  const value = String(raw || "").trim();
  if (!provider) return value;
  if (provider.id === "fmls") return value.replace(/[^0-9]/g, "");
  return value.replace(/\s+/g, "").toUpperCase();
}

export function validateMlsNumber(provider: MlsProvider | null, raw: string): { valid: boolean; message?: string; normalized: string } {
  const normalized = normalizeMlsNumber(provider, raw);
  if (!normalized) return { valid: false, message: "Enter your MLS listing number.", normalized };
  if (!provider) return { valid: true, normalized };
  try {
    const re = new RegExp(provider.number_pattern);
    if (!re.test(normalized)) {
      return { valid: false, message: `That doesn't look like a ${provider.short_label} listing number. ${provider.number_hint}.`, normalized };
    }
  } catch {
    return { valid: true, normalized };
  }
  return { valid: true, normalized };
}

export function extensionOf(name: string): string {
  return (String(name || "").match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase() || "";
}

export function isSupportedPhoto(provider: MlsProvider | null, name: string): boolean {
  const formats = provider?.supported_photo_formats || ["jpg", "jpeg", "png"];
  return formats.includes(extensionOf(name));
}