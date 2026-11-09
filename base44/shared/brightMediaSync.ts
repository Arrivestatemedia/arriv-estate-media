// brightMediaSync.ts
// Builds the Bright Media Sync manifest for a customer request that routed to Bright MLS.
//
// The manifest is the complete, deterministic description of what Arriv is asking Bright to take:
// the property, the listing identifier when one exists, and the customer's chosen media in the
// customer's order. It is generated at submission time and stored on the request, so the same
// request always describes the same media.
//
// Nothing here talks to Bright. Transmission is a separate, certification-gated step: while Bright's
// authentication, manifest, media-accessibility and authorized-import tests have not all passed, the
// manifest is recorded as `blocked_pending_certification` and an administrator publishes by hand.

import type { MlsServiceRegion } from "./mlsRegions.ts";
import type { PropertyLocation } from "./mlsRegions.ts";

export const BRIGHT_MANIFEST_VERSION = "bright.media-sync/1.0";

export interface BrightManifestMedia {
  drive_file_id: string;
  name: string;
  kind: "photo" | "video";
  position: number;
  youtube_url?: string;
}

export interface BrightManifestInput {
  requestId: string;
  provider: { id: string; label: string; short_label: string };
  region: MlsServiceRegion | null;
  location: PropertyLocation;
  job: any;
  listingNumber: string;
  media: BrightManifestMedia[];
  authorization: { confirmed: boolean; at: string; by_email: string; snapshot: string };
  generatedAt?: string;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatOf(name: string): string {
  return (String(name || "").match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase() || "";
}

/**
 * The manifest body plus its checksum. Ordering is taken from the caller (the customer's order),
 * never re-sorted here, so what Bright receives matches what the customer arranged.
 */
export async function buildBrightMediaSyncManifest(input: BrightManifestInput): Promise<{ manifest: any; checksum: string }> {
  const photos = input.media.filter((m) => m.kind === "photo").sort((a, b) => a.position - b.position);
  const videos = input.media.filter((m) => m.kind === "video").sort((a, b) => a.position - b.position);

  const body = {
    manifest_version: BRIGHT_MANIFEST_VERSION,
    manifest_id: `bright_${input.requestId}`,
    generated_at: input.generatedAt || new Date().toISOString(),
    destination: {
      provider: input.provider.id,
      provider_label: input.provider.label,
      region_id: input.region?.id || null,
      region_label: input.region?.label || null,
    },
    property: {
      address: input.location.address,
      city: input.location.city,
      state: input.location.state,
      zip: input.location.zip,
      county: input.location.county,
    },
    listing: {
      listing_number: input.listingNumber || null,
      listing_number_supplied: !!input.listingNumber,
    },
    source: {
      system: "arriv_estate_media",
      job_id: input.job?.id || null,
      booking_id: input.job?.booking_id || null,
      delivery_folder_id: input.job?.final_edits_folder_id || input.job?.drive_folder_id || null,
    },
    media: {
      photos: photos.map((p) => ({
        position: p.position,
        drive_file_id: p.drive_file_id,
        name: p.name,
        format: formatOf(p.name),
      })),
      videos: videos.map((v) => ({
        position: v.position,
        drive_file_id: v.drive_file_id,
        name: v.name,
        format: formatOf(v.name),
        hosting: v.youtube_url ? "unlisted_youtube" : "direct",
        youtube_url: v.youtube_url || null,
      })),
    },
    counts: { photos: photos.length, videos: videos.length },
    authorization: input.authorization,
  };

  const checksum = await sha256Hex(JSON.stringify(body));
  return { manifest: { ...body, checksum }, checksum };
}