// mlsJobContext.ts
// Small shared helpers the MLS functions all need: which property a job belongs to, and the
// authoritative allow-list of media in that job's delivery folder.
//
// The folder listing is the only source of truth for what may be packaged or submitted. A caller
// can never name an arbitrary Google Drive file and have it downloaded — the file must be in the
// job's own folder. This mirrors how Property Visibility already treats the same folder.

import { driveFolderIdFromJob } from "./jobMedia.ts";
import { parsePropertyLocation, type PropertyLocation } from "./mlsRegions.ts";

export interface DeliveryFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  isImage: boolean;
  isVideo: boolean;
}

/** Street address from the booking when one exists, otherwise the job's location label. */
export async function resolvePropertyAddress(base44: any, job: any): Promise<string> {
  if (!job) return "";
  if (job.booking_id) {
    try {
      const booking = await base44.asServiceRole.entities.Booking.get(job.booking_id);
      if (booking?.property_address) return String(booking.property_address).trim();
    } catch { /* fall through to the job label */ }
  }
  return String(job.location || job.title || "").trim();
}

interface GeocodedJurisdiction {
  county: string;
  city: string;
  state: string;
  source: string;
}

const JURISDICTION_CACHE = new Map<string, GeocodedJurisdiction>();

/**
 * The county — or, in Virginia and Maryland, the independent city the Census records it as — for an
 * address, from the U.S. Census Bureau geocoder. It needs no API key and returns the jurisdiction at
 * exactly the level MLS coverage is published at ("Fairfax County", "Alexandria city").
 *
 * Only those administrative facts are read, and results are cached per address because the gallery and
 * the submission resolve the same property within seconds of each other. An address the geocoder
 * cannot match returns null, so the routing layer holds the request for MLS review instead of guessing
 * at a town's county.
 */
async function geocodeJurisdiction(query: string): Promise<GeocodedJurisdiction | null> {
  const address = String(query || "").trim();
  if (!address) return null;
  const cached = JURISDICTION_CACHE.get(address);
  if (cached) return cached;
  try {
    const res = await fetch(
      `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(address)}` +
        "&benchmark=Public_AR_Current&vintage=Current_Current&format=json",
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const match = json?.result?.addressMatches?.[0];
    if (!match) return null;
    const geographies = match.geographies || {};
    const county = String(geographies.Counties?.[0]?.NAME || "").trim();
    const state = String(geographies.States?.[0]?.STUSAB || "").trim().toUpperCase();
    if (!county || !state) return null;
    const result: GeocodedJurisdiction = {
      county,
      city: String(geographies["Incorporated Places"]?.[0]?.NAME || "").trim(),
      state,
      source: "us-census-geocoder",
    };
    JURISDICTION_CACHE.set(address, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * The property's address broken into the parts the MLS service-area map matches on.
 * The booking holds the structured city/state the customer entered; the free-text address string
 * supplies city, state and zip when the booking's own fields are empty. A county the address does not
 * spell out is looked up, never inferred from a town name.
 */
export async function resolvePropertyLocation(base44: any, job: any): Promise<PropertyLocation> {
  if (!job) return parsePropertyLocation("");
  let booking: any = null;
  if (job.booking_id) {
    try {
      booking = await base44.asServiceRole.entities.Booking.get(job.booking_id);
    } catch { /* fall through to the job's own location */ }
  }
  const composed = [
    booking?.street_address,
    booking?.city,
    booking?.state,
  ].filter(Boolean).join(", ");
  const address = String(booking?.property_address || "").trim()
    || composed
    || String(job.location || job.title || "").trim();
  const parsed = parsePropertyLocation(address, booking?.city, booking?.state);
  if (parsed.county) return parsed;
  if (!parsed.state && !parsed.zip) return parsed;

  const geocoded = await geocodeJurisdiction(
    parsed.address || [parsed.city, parsed.state, parsed.zip].filter(Boolean).join(", "),
  );
  if (!geocoded) return parsed;
  // A lookup that lands in a different state is a bad match, not this property: leave the county empty
  // so the request is reviewed rather than routed on another state's jurisdiction.
  if (parsed.state && geocoded.state && parsed.state !== geocoded.state) return parsed;

  return {
    ...parsed,
    county: geocoded.county,
    city: parsed.city || geocoded.city,
    state: parsed.state || geocoded.state,
  };
}

export async function listDeliveryFiles(base44: any, job: any): Promise<{ folderId: string | null; files: DeliveryFile[] }> {
  const folderId = driveFolderIdFromJob(job);
  if (!folderId) return { folderId: null, files: [] };

  const accessToken = await base44.asServiceRole.connectors.getAccessToken("googledrive");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size)&orderBy=name&pageSize=1000`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error("The job's delivery folder could not be read");
  const data = await res.json();
  const files: DeliveryFile[] = (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? Number(f.size) : undefined,
    isImage: String(f.mimeType || "").startsWith("image/"),
    isVideo: String(f.mimeType || "").startsWith("video/"),
  }));
  return { folderId, files };
}

/** The production states in which delivered media may be requested for publication. */
export const DELIVERY_READY_STATUSES = ["delivered", "ready_for_delivery", "no_editing_required"];

export function isDeliveryReady(job: any): boolean {
  return DELIVERY_READY_STATUSES.includes(String(job?.production_status || ""));
}

/** Case-insensitive ownership check — the gallery and Drive metadata have disagreed on case before. */
export function ownsJob(job: any, clientEmail: string | undefined | null): boolean {
  const jobEmail = String(job?.client_email || "").trim().toLowerCase();
  const supplied = String(clientEmail || "").trim().toLowerCase();
  return !!jobEmail && !!supplied && jobEmail === supplied;
}

export function sanitizeLabel(name: string): string {
  return String(name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "Photo";
}