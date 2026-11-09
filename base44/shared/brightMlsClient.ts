// brightMlsClient.ts
// The Bright Media Sync wire contract.
//
// Arriv's stored request manifest (brightMediaSync.ts) is the internal evidence package: it keeps
// Drive file ids, the customer's ordering, the authorization snapshot and a checksum. Bright does
// not accept any of that shape. This module is the single place that converts the stored manifest
// into the body Bright documents, so the conversion can be inspected (preview) before anything is
// sent, and so a provider contract change only ever touches this file.
//
// Nothing here transmits by itself and nothing here decides whether a customer may publish. The
// certification switches in mlsProviders.ts remain the only gate for live publishing.

export interface BrightConfig {
  apiKey: string;
  vendorId: string;
  vendorName: string;
  endpoint: string;
  redirectBase: string;
  mediaSigningSecret: string;
}

export const BRIGHT_MAX_ATTEMPTS = 5;

/** Secrets Bright needs. `missing` is reported by name only — never a value. */
export function loadBrightConfig(): { config: BrightConfig; missing: string[] } {
  const config: BrightConfig = {
    apiKey: (Deno.env.get("BRIGHT_MLS_API_KEY") || "").trim(),
    vendorId: (Deno.env.get("BRIGHT_MLS_VENDOR_ID") || "").trim(),
    vendorName: (Deno.env.get("BRIGHT_MLS_VENDOR_NAME") || "").trim(),
    endpoint: (Deno.env.get("BRIGHT_MLS_MANIFEST_ENDPOINT") || "").trim(),
    redirectBase: (Deno.env.get("BRIGHT_MLS_REDIRECT_BASE_URL") || "").trim().replace(/\/+$/, ""),
    mediaSigningSecret: (Deno.env.get("BRIGHT_MLS_MEDIA_SIGNING_SECRET") || "").trim(),
  };

  const missing: string[] = [];
  if (!config.apiKey) missing.push("BRIGHT_MLS_API_KEY");
  if (!config.vendorId) missing.push("BRIGHT_MLS_VENDOR_ID");
  if (!config.vendorName) missing.push("BRIGHT_MLS_VENDOR_NAME");
  if (!config.endpoint) missing.push("BRIGHT_MLS_MANIFEST_ENDPOINT");
  if (!config.redirectBase) missing.push("BRIGHT_MLS_REDIRECT_BASE_URL");
  if (!config.mediaSigningSecret) missing.push("BRIGHT_MLS_MEDIA_SIGNING_SECRET");
  return { config, missing };
}

/** Everything needed to send a manifest is present. */
export function brightConfigComplete(config: BrightConfig): boolean {
  return !!(config.apiKey && config.vendorId && config.vendorName && config.endpoint);
}

export function brightImportUrl(redirectBase: string, manifestId: string): string | null {
  if (!redirectBase || !manifestId) return null;
  return `${redirectBase}/mlsredirect/bright/${encodeURIComponent(manifestId)}`;
}

export interface BrightFieldMapping {
  bright_field: string;
  source: string;
  status: "mapped" | "missing" | "unverified";
}

export interface BrightBodyResult {
  body: any;
  field_map: BrightFieldMapping[];
  gaps: string[];
  assumptions: string[];
  skipped: string[];
}

/**
 * Builds the request body Bright documents:
 *   vendorId, vendorName, dateFileCreated, mlsId?, propertyAddress?, listItems[]
 * Photographs carry imageUrls.fullSize (the signed, expiring Arriv media URL — never a Drive id).
 * Video is not a file to Bright: it is a tour_url item pointing at the unlisted YouTube link.
 */
export function buildBrightRequestBody(params: {
  storedManifest: any;
  config: BrightConfig;
  mediaUrls: Record<string, string>;
  now?: Date;
}): BrightBodyResult {
  const { storedManifest, config, mediaUrls } = params;
  const now = params.now || new Date();
  const gaps: string[] = [];
  const skipped: string[] = [];

  const listItems: any[] = [];
  const photos = Array.isArray(storedManifest?.media?.photos) ? [...storedManifest.media.photos] : [];
  photos.sort((a: any, b: any) => Number(a?.position || 0) - Number(b?.position || 0));

  for (const photo of photos) {
    const url = mediaUrls[String(photo?.drive_file_id || "")];
    if (!url) {
      skipped.push(`${photo?.name || photo?.drive_file_id || "a photograph"} — no media link could be built`);
      continue;
    }
    listItems.push({ mediaType: "photo", imageUrls: { fullSize: url } });
  }

  const videos = Array.isArray(storedManifest?.media?.videos) ? [...storedManifest.media.videos] : [];
  videos.sort((a: any, b: any) => Number(a?.position || 0) - Number(b?.position || 0));
  for (const video of videos) {
    const tourUrl = String(video?.youtube_url || "").trim();
    if (!tourUrl) {
      skipped.push(`${video?.name || video?.drive_file_id || "a video"} — no unlisted YouTube link yet`);
      continue;
    }
    listItems.push({ mediaType: "tour_url", tourUrl });
  }

  if (listItems.length === 0) gaps.push("The manifest contains no sendable media items.");
  if (skipped.length > 0) gaps.push(`${skipped.length} selected item(s) cannot be sent and were left out.`);

  const listingNumber = String(storedManifest?.listing?.listing_number || "").trim();
  const propertyAddress = String(storedManifest?.property?.address || "").trim();

  const body: any = {};
  if (config.vendorId) body.vendorId = config.vendorId; else gaps.push("BRIGHT_MLS_VENDOR_ID is not set, so vendorId cannot be sent.");
  if (config.vendorName) body.vendorName = config.vendorName; else gaps.push("BRIGHT_MLS_VENDOR_NAME is not set, so vendorName cannot be sent.");
  body.dateFileCreated = now.toISOString();
  if (listingNumber) body.mlsId = listingNumber;
  if (propertyAddress) body.propertyAddress = propertyAddress;
  else gaps.push("The request has no property address, so Bright cannot match the listing.");
  body.listItems = listItems;

  const field_map: BrightFieldMapping[] = [
    { bright_field: "vendorId", source: "BRIGHT_MLS_VENDOR_ID secret (x-api-user identifies the vendor)", status: body.vendorId ? "mapped" : "missing" },
    { bright_field: "vendorName", source: "BRIGHT_MLS_VENDOR_NAME secret", status: body.vendorName ? "mapped" : "missing" },
    { bright_field: "dateFileCreated", source: "Generated at send time (ISO 8601 UTC)", status: "unverified" },
    { bright_field: "mlsId", source: "Stored manifest listing.listing_number", status: body.mlsId ? "mapped" : "missing" },
    { bright_field: "propertyAddress", source: "Stored manifest property.address", status: body.propertyAddress ? "mapped" : "missing" },
    { bright_field: "listItems[].mediaType=photo", source: "Stored manifest media.photos[].drive_file_id", status: photos.length ? "mapped" : "missing" },
    { bright_field: "listItems[].imageUrls.fullSize", source: "Signed per-file Arriv media URL (serveBrightMedia)", status: "mapped" },
    { bright_field: "listItems[].mediaType=tour_url", source: "Stored manifest media.videos[].youtube_url", status: videos.length ? "mapped" : "missing" },
    { bright_field: "listItems ordering", source: "Customer display order, preserved as array order", status: "unverified" },
    { bright_field: "(internal) Drive file ids, folder id, authorization snapshot, checksum", source: "Kept in the stored manifest only", status: "mapped" },
  ];

  const assumptions = [
    "Photograph order is carried by array order. Bright's documentation as provided does not name a separate ordering field, so no invented field is sent.",
    "dateFileCreated is sent as an ISO 8601 UTC timestamp; Bright's expected date format is not confirmed in the documentation provided.",
    "Only mediaType 'photo' with imageUrls.fullSize and mediaType 'tour_url' with tourUrl are produced. Any additional media types or image sizes Bright documents are not sent until confirmed.",
    "mlsId is included only when the customer supplied a listing number; address matching is relied on otherwise.",
  ];

  return { body, field_map, gaps, assumptions, skipped };
}

export interface BrightOutcome {
  outcome: "accepted" | "rejected" | "retry";
  status: number;
  manifestId?: string;
  message: string;
}

function errorMessageFrom(payload: any, fallback: string): string {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload.slice(0, 500);
  const direct = payload.message || payload.error_description || payload.error || payload.detail;
  if (typeof direct === "string" && direct.trim()) return direct.trim().slice(0, 500);
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors
      .map((e: any) => (typeof e === "string" ? e : [e?.field, e?.message].filter(Boolean).join(": ")))
      .filter(Boolean)
      .join("; ")
      .slice(0, 500);
  }
  return fallback;
}

/**
 * Reads Bright's reply. Only a 2xx carrying a manifestId counts as accepted, because without the
 * manifestId there is no import link and the import cannot be handed to the agent.
 * 5xx, 429 and transport failures are retried; 4xx are not — they are a defect in what we sent.
 */
export function classifyBrightResponse(status: number, payload: any, transportError?: string): BrightOutcome {
  if (transportError) {
    return { outcome: "retry", status: 0, message: `Bright could not be reached: ${transportError}` };
  }

  const manifestId = payload?.manifestId || payload?.manifest_id || payload?.id || null;

  if (status >= 200 && status < 300) {
    if (!manifestId) {
      return { outcome: "retry", status, message: "Bright accepted the manifest but returned no manifestId, so no import link can be built." };
    }
    return { outcome: "accepted", status, manifestId: String(manifestId), message: "Bright accepted the manifest." };
  }

  if (status === 401 || status === 403) {
    return { outcome: "rejected", status, message: `Bright rejected the credentials (check BRIGHT_MLS_API_KEY and BRIGHT_MLS_VENDOR_ID). ${errorMessageFrom(payload, "")}`.trim() };
  }
  if (status === 429) {
    return { outcome: "retry", status, message: "Bright is rate limiting us." };
  }
  if (status >= 500) {
    return { outcome: "retry", status, message: `Bright returned ${status}.` };
  }
  return { outcome: "rejected", status, message: errorMessageFrom(payload, `Bright rejected the manifest (${status}).`) };
}

/** Exponential backoff: 5, 10, 20, 40 minutes. */
export function nextBrightRetryAt(attempts: number, now: Date = new Date()): string {
  const minutes = Math.min(5 * Math.pow(2, Math.max(0, attempts - 1)), 60);
  return new Date(now.getTime() + minutes * 60 * 1000).toISOString();
}