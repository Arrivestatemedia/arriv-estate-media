// brightMlsClient.ts
// The Bright Media Sync wire contract.
//
// Arriv's stored request manifest (brightMediaSync.ts) is the internal evidence package: it keeps
// Drive file ids, the customer's ordering, the authorization snapshot and a checksum. Bright does
// not accept any of that shape. This module is the single place that converts the stored manifest
// into the body Bright documents, so the conversion can be inspected (preview) and validated
// before anything is sent, and so a provider contract change only ever touches this file.
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

/** Bright accepts a photograph when the fileName ends in one of these. */
export const BRIGHT_SUPPORTED_PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "heic", "heif", "webp"];

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

/**
 * Bright serves the agent import redirect at the host root — `/mlsredirect/bright/{manifestId}` —
 * and nothing else. Any path segment in front of it (for example the manifest endpoint's own
 * segment) answers 403 `{"message":"Missing Authentication Token"}`, so only the origin of the
 * configured base is used.
 */
export function brightImportUrl(redirectBase: string, manifestId: string): string | null {
  if (!redirectBase || !manifestId) return null;
  let origin = redirectBase.replace(/\/+$/, "");
  try {
    origin = new URL(redirectBase).origin;
  } catch { /* keep the trimmed base when it cannot be parsed */ }
  return `${origin}/mlsredirect/bright/${encodeURIComponent(manifestId)}`;
}

function extensionOfName(value: string): string {
  return (String(value || "").match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase() || "";
}

/**
 * Bright matches the listing from a single address line, so the street, city, state and ZIP recorded
 * on the booking are composed into it. Anything already written in the street line is not repeated,
 * which keeps an address that already carries every part unchanged.
 */
export function composePropertyAddress(property: any): string {
  const street = String(property?.address || "").trim().replace(/[,\s]+$/, "");
  if (!street) return "";
  const segments = [
    String(property?.city || "").trim(),
    [String(property?.state || "").trim(), String(property?.zip || "").trim()].filter(Boolean).join(" "),
  ].filter(Boolean);
  const parts = [street];
  for (const segment of segments) {
    const present = parts.join(", ").toLowerCase();
    const missingPart = segment.toLowerCase().split(/\s+/).some((token) => token && !present.includes(token));
    if (missingPart) parts.push(segment);
  }
  return parts.join(", ");
}

/** Maps an extension onto Bright's accepted set. `jpeg` is sent as `jpg` (same bytes, listed extension). */
function supportedPhotoExtension(value: string): string {
  const clean = String(value || "").replace(/^\./, "").trim().toLowerCase();
  if (!clean) return "";
  if (clean === "jpeg") return "jpg";
  return BRIGHT_SUPPORTED_PHOTO_EXTENSIONS.includes(clean) ? clean : "";
}

/**
 * A photograph's fileName must end in JPG, PNG, HEIC, HEIF or WebP. The stored name is kept
 * whenever it already complies; otherwise the extension is taken from what Drive reported about the
 * file, then from the stored format, and only then defaulted to jpg (recorded as a gap).
 */
function brightPhotoFileName(rawName: string, format: string, mimeType: string): { fileName: string; adjusted: boolean } {
  // Surrounding whitespace and capitalization are ignored by Bright, so they are normalized before
  // the extension is read — otherwise " kitchen.JPG " would be mistaken for an extensionless name.
  const source = String(rawName || "").split("/").pop()?.trim() || "";
  const ext = extensionOfName(source);
  const stem = ext ? source.slice(0, source.length - ext.length - 1) : source;
  const mimeExt = String(mimeType || "").split("/")[1] || "";
  const chosen = supportedPhotoExtension(ext) || supportedPhotoExtension(format) || supportedPhotoExtension(mimeExt) || "jpg";
  const safeStem = (stem.trim() || "photograph").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);
  return { fileName: `${safeStem}.${chosen}`, adjusted: chosen !== ext };
}

/** Filename uniqueness ignores capitalization and surrounding whitespace. */
function uniqueFileName(candidate: string, used: Set<string>): string {
  const ext = extensionOfName(candidate);
  const stem = ext ? candidate.slice(0, candidate.length - ext.length - 1) : candidate;
  let name = candidate;
  let n = 2;
  while (used.has(name.trim().toLowerCase())) {
    name = `${stem}-${n}${ext ? `.${ext}` : ""}`;
    n += 1;
  }
  used.add(name.trim().toLowerCase());
  return name;
}

const BRIGHT_LOCAL_TZ = "America/New_York";

/**
 * Bright illustrates lastModified as `6/27/2024 10:33:38 AM`, so that is the form produced here.
 * The example carries no timezone; Bright's market is served on US Eastern time, and that is the
 * assumption recorded in the preview until Bright confirms otherwise.
 */
export function brightTimestamp(value?: unknown, now: Date = new Date()): string {
  let date = now;
  if (value) {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRIGHT_LOCAL_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")} ${get("dayPeriod")}`;
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
 *   vendorId, vendorName, dateFileCreated (ISO 8601 UTC), mlsId?, propertyAddress, listItems[]
 * Every list item carries id, fileName and lastModified; photographs add imageUrls.fullSize (the
 * signed, expiring Arriv media URL — never a Drive id), plus description/roomType when known.
 */
export function buildBrightRequestBody(params: {
  storedManifest: any;
  config: BrightConfig;
  mediaUrls: Record<string, string>;
  modifiedTimes?: Record<string, string>;
  now?: Date;
}): BrightBodyResult {
  const { storedManifest, config, mediaUrls } = params;
  const modifiedTimes = params.modifiedTimes || {};
  const now = params.now || new Date();
  const generatedAt = storedManifest?.generated_at || now.toISOString();
  const gaps: string[] = [];
  const skipped: string[] = [];
  const listItems: any[] = [];

  const usedPhotoNames = new Set<string>();
  const usedTourNames = new Set<string>();
  const usedDocNames = new Set<string>();
  const usedFloorPlanNames = new Set<string>();

  const photos = Array.isArray(storedManifest?.media?.photos) ? [...storedManifest.media.photos] : [];
  photos.sort((a: any, b: any) => Number(a?.position || 0) - Number(b?.position || 0));

  let photoCount = 0;
  for (const photo of photos) {
    const fileId = String(photo?.drive_file_id || "");
    const url = mediaUrls[fileId];
    if (!url) {
      skipped.push(`${photo?.name || fileId || "a photograph"} — no media link could be built`);
      continue;
    }
    const named = brightPhotoFileName(photo?.name, photo?.format, photo?.mime_type);
    if (named.adjusted) {
      gaps.push(`${named.fileName} replaces ${photo?.name || fileId} because the filename must end in a Bright-supported extension.`);
    }
    photoCount += 1;
    const item: any = {
      // Numeric ids, numbered from 1 within this media type, as in Bright's documented examples.
      id: photoCount,
      fileName: uniqueFileName(named.fileName, usedPhotoNames),
      lastModified: brightTimestamp(modifiedTimes[fileId] || photo?.last_modified || photo?.modified_at || generatedAt, now),
      mediaType: "photo",
      imageUrls: { fullSize: url },
    };
    const description = String(photo?.description || photo?.alt_text || "").trim();
    if (description) item.description = description;
    const roomType = String(photo?.room_type || "").trim();
    if (roomType) item.roomType = roomType;
    listItems.push(item);
  }

  const videos = Array.isArray(storedManifest?.media?.videos) ? [...storedManifest.media.videos] : [];
  videos.sort((a: any, b: any) => Number(a?.position || 0) - Number(b?.position || 0));

  let tourCount = 0;
  for (const video of videos) {
    const tourUrl = String(video?.youtube_url || "").trim();
    if (!tourUrl) {
      skipped.push(`${video?.name || video?.drive_file_id || "a video"} — no unlisted YouTube link yet`);
      continue;
    }
    tourCount += 1;
    const sourceName = String(video?.name || "").split("/").pop().trim();
    listItems.push({
      id: tourCount,
      fileName: uniqueFileName(sourceName || `tour-${tourCount}`, usedTourNames),
      lastModified: brightTimestamp(
        modifiedTimes[String(video?.drive_file_id || "")] || video?.last_modified || video?.modified_at || generatedAt,
        now,
      ),
      mediaType: "tour_url",
      tourUrl,
    });
  }

  // Documents and floor plans need a publicly reachable docUrl plus a docVisibility value. Neither
  // is confirmed yet, so an item is only sent when the stored manifest already carries both — no
  // placeholder URL and no guessed visibility value is ever invented here.
  const docGroups: Array<{ key: string; mediaType: string; prefix: string; used: Set<string> }> = [
    { key: "documents", mediaType: "document", prefix: "document", used: usedDocNames },
    { key: "floor_plans", mediaType: "floor_plan", prefix: "floorplan", used: usedFloorPlanNames },
  ];
  for (const group of docGroups) {
    const rows = Array.isArray(storedManifest?.media?.[group.key]) ? storedManifest.media[group.key] : [];
    let count = 0;
    for (const doc of rows) {
      const docUrl = String(doc?.doc_url || doc?.url || "").trim();
      const docVisibility = String(doc?.doc_visibility || "").trim();
      const label = String(doc?.name || docUrl || group.mediaType);
      if (!docUrl || !docVisibility) {
        skipped.push(`${label} — ${group.mediaType} needs a public URL and a confirmed docVisibility value`);
        continue;
      }
      count += 1;
      listItems.push({
        id: count,
        fileName: uniqueFileName(String(doc?.name || `${group.prefix}-${count}`), group.used),
        lastModified: brightTimestamp(doc?.last_modified || generatedAt, now),
        mediaType: group.mediaType,
        docUrl,
        docVisibility,
      });
    }
  }

  if (listItems.length === 0) gaps.push("The manifest contains no sendable media items.");
  if (skipped.length > 0) gaps.push(`${skipped.length} selected item(s) cannot be sent and were left out.`);

  const listingNumber = String(storedManifest?.listing?.listing_number || "").trim();
  const storedProperty = storedManifest?.property || {};
  const propertyAddress = composePropertyAddress(storedProperty);

  const body: any = {};
  if (config.vendorId) body.vendorId = config.vendorId; else gaps.push("BRIGHT_MLS_VENDOR_ID is not set, so vendorId cannot be sent.");
  if (config.vendorName) body.vendorName = config.vendorName; else gaps.push("BRIGHT_MLS_VENDOR_NAME is not set, so vendorName cannot be sent.");
  body.dateFileCreated = now.toISOString();
  if (listingNumber) body.mlsId = listingNumber;
  if (propertyAddress) body.propertyAddress = propertyAddress;
  else gaps.push("The request has no property address, so Bright cannot match the listing.");
  body.listItems = listItems;

  const field_map: BrightFieldMapping[] = [
    { bright_field: "vendorId", source: "BRIGHT_MLS_VENDOR_ID secret — should match the assigned API user; not yet confirmed by an authorized test", status: body.vendorId ? "unverified" : "missing" },
    { bright_field: "vendorName", source: "BRIGHT_MLS_VENDOR_NAME secret", status: body.vendorName ? "mapped" : "missing" },
    { bright_field: "dateFileCreated", source: "Generated at send time, ISO 8601 UTC", status: "mapped" },
    { bright_field: "mlsId", source: "Stored manifest listing.listing_number (sent only when supplied)", status: body.mlsId ? "mapped" : "missing" },
    { bright_field: "propertyAddress", source: "Stored manifest street plus city, state and ZIP composed into one line", status: body.propertyAddress ? "mapped" : "missing" },
    { bright_field: "listItems[].id / fileName / lastModified", source: "Derived per item; ids are numbers counted from 1 within each media type, filenames de-duplicated", status: "mapped" },
    { bright_field: "listItems[].mediaType=photo", source: "Stored manifest media.photos[].drive_file_id", status: photos.length ? "mapped" : "missing" },
    { bright_field: "listItems[].imageUrls.fullSize", source: "Signed per-file Arriv media URL (serveBrightMedia)", status: "mapped" },
    { bright_field: "listItems[].description / roomType", source: "Stored photo description / room_type, only when present", status: "mapped" },
    { bright_field: "listItems[].mediaType=tour_url", source: "Stored manifest media.videos[].youtube_url", status: videos.length ? "mapped" : "missing" },
    { bright_field: "listItems[].mediaType=document / floor_plan", source: "Stored manifest media.documents / floor_plans, only when a public URL and docVisibility are already recorded", status: "unverified" },
    { bright_field: "listItems ordering", source: "Customer display order, preserved as array order", status: "unverified" },
    { bright_field: "(internal) Drive file ids, folder id, authorization snapshot, checksum", source: "Kept in the stored manifest only", status: "mapped" },
  ];

  const assumptions = [
    "dateFileCreated is ISO 8601 UTC, as the documentation states.",
    "lastModified is sent in the documented example form (6/27/2024 10:33:38 AM) using US Eastern time, because the example carries no timezone. Confirm Bright's expected timezone.",
    "lastModified uses the Drive modification time when it can be read and the manifest's generation time otherwise.",
    "Photograph order is carried by array order only; the documentation names no ordering field.",
    "Only mediaType photo (imageUrls.fullSize), tour_url (tourUrl), document and floor_plan (docUrl + docVisibility) are produced.",
    "mlsId is included only when the customer supplied a listing number; address matching is relied on otherwise.",
    "propertyAddress is sent as the single stored address string; confirm whether the portal schema wants a structured address.",
  ];

  return { body, field_map, gaps, assumptions, skipped };
}

export interface BrightValidationCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

/**
 * Checks the built body against the documented contract before it can cost money. Anything failing
 * here is blocking: a body Bright would reject is never POSTed, because a rejected attempt is still
 * an attempt against the vendor account.
 */
export function validateBrightBody(body: any): { checks: BrightValidationCheck[]; blocking: string[] } {
  const checks: BrightValidationCheck[] = [];
  const blocking: string[] = [];
  const items = Array.isArray(body?.listItems) ? body.listItems : [];
  const fail = (id: string, label: string, detail: string) => {
    checks.push({ id, label, status: "fail", detail });
    blocking.push(detail);
  };
  const pass = (id: string, label: string, detail: string) => checks.push({ id, label, status: "pass", detail });

  const missingTop = ["vendorId", "vendorName", "dateFileCreated", "propertyAddress"]
    .filter((f) => !String(body?.[f] || "").trim());
  if (missingTop.length) fail("top_level", "Documented top-level fields", `Missing top-level field(s): ${missingTop.join(", ")}.`);
  else pass("top_level", "Documented top-level fields", "vendorId, vendorName, dateFileCreated and propertyAddress are all present.");

  const created = String(body?.dateFileCreated || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(created)) {
    fail("date_iso", "dateFileCreated is ISO 8601 UTC", `dateFileCreated is not ISO 8601 UTC: ${created || "(empty)"}.`);
  } else {
    pass("date_iso", "dateFileCreated is ISO 8601 UTC", created);
  }

  const stampPattern = /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2} (AM|PM)$/;
  const badStamps = items.filter((i: any) => !stampPattern.test(String(i?.lastModified || "")));
  if (badStamps.length) {
    fail("last_modified", "lastModified format", `${badStamps.length} item(s) are not in the documented M/D/YYYY h:mm:ss AM/PM form.`);
  } else {
    pass("last_modified", "lastModified format", "Every item uses the documented M/D/YYYY h:mm:ss AM/PM form.");
  }

  const missingItemFields: string[] = [];
  for (const item of items) {
    const required = ["id", "fileName", "lastModified", "mediaType"];
    const absent = required.filter((f) => !String(item?.[f] || "").trim());
    if (item?.mediaType === "photo" && !String(item?.imageUrls?.fullSize || "").trim()) absent.push("imageUrls.fullSize");
    if (item?.mediaType === "tour_url" && !String(item?.tourUrl || "").trim()) absent.push("tourUrl");
    if ((item?.mediaType === "document" || item?.mediaType === "floor_plan")) {
      if (!String(item?.docUrl || "").trim()) absent.push("docUrl");
      if (!String(item?.docVisibility || "").trim()) absent.push("docVisibility");
    }
    if (absent.length) missingItemFields.push(`${item?.fileName || item?.mediaType}: ${absent.join(", ")}`);
  }
  if (missingItemFields.length) fail("item_fields", "Per-item documented fields", `Incomplete item(s): ${missingItemFields.join("; ")}.`);
  else pass("item_fields", "Per-item documented fields", `All ${items.length} item(s) carry id, fileName, lastModified and their media-type field.`);

  const photoItems = items.filter((i: any) => i?.mediaType === "photo");
  const badExtensions = photoItems.filter((p: any) => !BRIGHT_SUPPORTED_PHOTO_EXTENSIONS.includes(extensionOfName(p?.fileName)));
  if (badExtensions.length) {
    fail("photo_extension", "Photograph filenames end in a supported extension",
      `Not supported by Bright: ${badExtensions.map((p: any) => p?.fileName).join(", ")}.`);
  } else {
    pass("photo_extension", "Photograph filenames end in a supported extension",
      photoItems.length ? `${photoItems.length} filename(s) end in ${BRIGHT_SUPPORTED_PHOTO_EXTENSIONS.join("/")}.` : "No photographs in this manifest.");
  }

  const photoUrls: string[] = photoItems
    .map((p: any) => String(p?.imageUrls?.fullSize || ""))
    .filter(Boolean);
  const badPhotoUrls = photoUrls.filter((u) => !/^https:\/\//i.test(u));
  if (badPhotoUrls.length) fail("photo_urls", "Photograph links are absolute https URLs", `${badPhotoUrls.length} link(s) are not absolute https.`);
  else pass("photo_urls", "Photograph links are absolute https URLs", `${photoUrls.length} signed link(s).`);

  const tourItems = items.filter((i: any) => i?.mediaType === "tour_url");
  const badTours = tourItems.filter((t: any) => !/^https:\/\//i.test(String(t?.tourUrl || "")));
  if (badTours.length) fail("tour_urls", "Tour links are absolute https URLs", `${badTours.length} tour link(s) are not absolute https.`);
  else pass("tour_urls", "Tour links are absolute https URLs", `${tourItems.length} tour link(s).`);

  const groups = new Map<string, any[]>();
  for (const item of items) {
    const key = String(item?.mediaType || "unknown");
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  const duplicateProblems: string[] = [];
  for (const [mediaType, rows] of groups) {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const row of rows) {
      const id = String(row?.id || "").trim();
      const name = String(row?.fileName || "").trim().toLowerCase();
      if (ids.has(id)) duplicateProblems.push(`${mediaType}: duplicate id ${id}`);
      if (names.has(name)) duplicateProblems.push(`${mediaType}: duplicate fileName ${name}`);
      ids.add(id);
      names.add(name);
    }
  }
  if (duplicateProblems.length) {
    fail("uniqueness", "Ids and filenames unique per media type", duplicateProblems.join("; "));
  } else {
    pass("uniqueness", "Ids and filenames unique per media type",
      [...groups.entries()].map(([t, rows]) => `${t}: ${rows.length}`).join(", ") || "No items.");
  }

  if (items.length === 0) fail("items_present", "Media items present", "The manifest produced no media items.");
  else pass("items_present", "Media items present", `${items.length} item(s).`);

  return { checks, blocking };
}

/** `retry` is only ever returned when Bright certainly created nothing (429). */
export type BrightOutcomeKind = "accepted" | "rejected" | "retry" | "ambiguous";

export interface BrightOutcome {
  outcome: BrightOutcomeKind;
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
 * Reads Bright's reply. Bright's documented success body is `{ "manifestId": "<uuid>" }`, so only a
 * 2xx carrying a manifestId counts as accepted — without it there is no import link.
 *
 * A manifest is billable, so the difference between "safe to resend" and "may already exist" matters:
 *   accepted  — we hold the manifestId. Never send this request again.
 *   retry     — 429 only: Bright certainly created nothing, so a later attempt cannot duplicate.
 *   ambiguous — the request may have created a manifest before the failure (timeout, connection
 *               dropped mid-flight, 5xx, or a 2xx with no manifestId). Nothing is retried
 *               automatically; an administrator checks Bright and resends only if it is absent.
 *   rejected  — 4xx: a defect in what we sent. Fix it, then send again.
 */
export function classifyBrightResponse(status: number, payload: any, transportError?: string): BrightOutcome {
  if (transportError) {
    return {
      outcome: "ambiguous",
      status: 0,
      message: `Bright could not be reached or did not answer (${transportError}).`,
    };
  }

  const manifestId = payload?.manifestId || payload?.manifest_id || null;

  if (status >= 200 && status < 300) {
    if (!manifestId) {
      return {
        outcome: "ambiguous",
        status,
        message: "Bright answered without a manifestId, so a manifest may or may not exist.",
      };
    }
    return { outcome: "accepted", status, manifestId: String(manifestId), message: "Bright accepted the manifest." };
  }

  if (status === 401 || status === 403) {
    return { outcome: "rejected", status, message: `Bright rejected the credentials (check BRIGHT_MLS_API_KEY and BRIGHT_MLS_VENDOR_ID). ${errorMessageFrom(payload, "")}`.trim() };
  }
  if (status === 429) {
    return { outcome: "retry", status, message: "Bright is rate limiting us; nothing was created." };
  }
  if (status >= 500) {
    return { outcome: "ambiguous", status, message: `Bright returned ${status}, so a manifest may already exist.` };
  }
  return { outcome: "rejected", status, message: errorMessageFrom(payload, `Bright rejected the manifest (${status}).`) };
}

/** Exponential backoff: 5, 10, 20, 40 minutes. */
export function nextBrightRetryAt(attempts: number, now: Date = new Date()): string {
  const minutes = Math.min(5 * Math.pow(2, Math.max(0, attempts - 1)), 60);
  return new Date(now.getTime() + minutes * 60 * 1000).toISOString();
}