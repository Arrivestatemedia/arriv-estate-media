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
}

export const MLS_PROVIDER_DEFAULTS: Record<string, MlsProvider> = {
  fmls: {
    id: "fmls",
    label: "FMLS — First Multiple Listing Service",
    short_label: "FMLS",
    enabled: true,
    photo_limit: 200,
    supported_photo_formats: ["jpg", "jpeg", "png"],
    video_support: "virtual_tour_url",
    video_requirement_note: "FMLS takes video as a virtual tour URL. Arriv supplies the unlisted YouTube link.",
    upload_method: "admin_manual_matrix",
    number_pattern: "^\\d{6,9}$",
    number_hint: "6 to 9 digits, as shown in FMLS Matrix",
    requires_authorization: true,
  },
  georgia_mls: {
    id: "georgia_mls",
    label: "Georgia MLS",
    short_label: "Georgia MLS",
    enabled: false,
    photo_limit: 100,
    supported_photo_formats: ["jpg", "jpeg", "png"],
    video_support: "virtual_tour_url",
    video_requirement_note: "Integration and provider requirements pending confirmation.",
    upload_method: "admin_manual_matrix",
    number_pattern: "^\\d{6,10}$",
    number_hint: "Listing number as shown in Georgia MLS",
    requires_authorization: true,
  },
  bright_mls: {
    id: "bright_mls",
    label: "Bright MLS",
    short_label: "Bright MLS",
    enabled: false,
    photo_limit: 100,
    supported_photo_formats: ["jpg", "jpeg", "png"],
    video_support: "virtual_tour_url",
    video_requirement_note: "Media Sync integration not configured.",
    upload_method: "admin_manual_matrix",
    number_pattern: "^[A-Za-z0-9-]{4,20}$",
    number_hint: "Listing number as shown in Bright MLS",
    requires_authorization: true,
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