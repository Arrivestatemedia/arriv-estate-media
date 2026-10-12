// Edge cache invalidation for the property serving layer.
//
// The app is the authority; the edge holds a copy. Whenever a listing's public content or its
// serviceability changes, the exact edge keys must be dropped so a stale page or a
// de-authorized asset cannot keep being served.
//
// This module is INERT until both secrets exist:
//   PROPERTY_EDGE_PURGE_URL     e.g. https://properties.arrivestatemedia.com/__purge
//   PROPERTY_EDGE_PURGE_SECRET  shared HMAC secret (also set on the edge worker)
// With either missing it does nothing and reports skipped, so the app's behaviour is unchanged
// while the serving layer is not yet deployed.

export const EDGE_PURGE_URL_ENV = "PROPERTY_EDGE_PURGE_URL";
export const EDGE_PURGE_SECRET_ENV = "PROPERTY_EDGE_PURGE_SECRET";

const PURGE_TIMEOUT_MS = 4000;

function env(name: string): string {
  try {
    return String((globalThis as any)?.process?.env?.[name] ?? "").trim();
  } catch {
    return "";
  }
}

export function edgePurgeConfigured(): boolean {
  return !!env(EDGE_PURGE_URL_ENV) && !!env(EDGE_PURGE_SECRET_ENV);
}

function bytesToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`)));
}

export interface EdgePurgePayload {
  listing_id?: string;
  slug?: string;
  slugs?: string[];
  file_ids?: string[];
}

// Fire-and-forget cache invalidation. It never throws: a customer action must not fail because
// the edge is unreachable, and the edge's media TTL bound limits the exposure of a lost purge.
export async function requestEdgePurge(payload: EdgePurgePayload): Promise<{ ok: boolean; skipped?: boolean; status?: number; error?: string }> {
  if (!edgePurgeConfigured()) return { ok: false, skipped: true };

  const url = env(EDGE_PURGE_URL_ENV);
  const secret = env(EDGE_PURGE_SECRET_ENV);
  const body = JSON.stringify({
    listing_id: payload.listing_id || "",
    slug: payload.slug || "",
    slugs: payload.slugs || [],
    file_ids: payload.file_ids || [],
  });
  const timestamp = String(Math.floor(Date.now() / 1000));

  try {
    const signature = await sign(secret, timestamp, body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PURGE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-arriv-signature": signature, "x-arriv-timestamp": timestamp },
        body,
        signal: controller.signal,
      });
      return { ok: res.ok, status: res.status };
    } finally {
      clearTimeout(timer);
    }
  } catch (error: any) {
    return { ok: false, error: String(error?.message || error) };
  }
}

// Convenience wrapper for a listing record: drops the page, the sitemap and every media key the
// listing can currently expose.
export async function purgeListingFromEdge(listing: any, extraSlugs: string[] = []): Promise<{ ok: boolean; skipped?: boolean; status?: number; error?: string }> {
  if (!listing) return { ok: false, skipped: true };
  const fileIds = (listing.selected_media || [])
    .map((m: any) => String(m?.drive_file_id || ""))
    .filter(Boolean)
    .slice(0, 200);
  if (listing.cover_file_id) fileIds.push(String(listing.cover_file_id));
  return requestEdgePurge({
    listing_id: listing.listing_id || "",
    slug: listing.public_slug || "",
    slugs: extraSlugs,
    file_ids: fileIds,
  });
}