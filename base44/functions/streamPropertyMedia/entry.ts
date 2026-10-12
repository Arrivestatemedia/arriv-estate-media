import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { isPubliclyReachable, recordInScope, resolveFeatureGate } from "../../shared/propertyVisibility.ts";
import { fetchJobFile, fetchJobPhotoPreview } from "../../shared/jobMedia.ts";

// Public media delivery for a published property page.
//
// Security boundary: a file may only be streamed when it is in the PUBLISHED listing's own
// approved media selection (photos and other approved assets, plus video only when the
// customer included it). A private or draft asset can never be fetched, and nothing is copied
// into public storage — the delivered file is read from the job's private Drive folder and
// streamed, so there is no duplicated storage and no public URL to leak.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const listingId = String(url.searchParams.get("listing") || "");
    const fileId = String(url.searchParams.get("file") || "");
    if (!listingId || !fileId) return Response.json({ error: "listing and file are required" }, { status: 400 });

    // ABSOLUTE BLOCK on synthetic records: no test-mode parameter is accepted here, so this endpoint
    // cannot be put into a mode that resolves a certification record. A synthetic listing's assets are
    // never served to a public request, in any circumstance.
    const gate = await resolveFeatureGate(base44, false);
    if (!gate.enabled) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const rows = await base44.asServiceRole.entities.PropertyListing.filter({ listing_id: listingId });
    const listing = (Array.isArray(rows) ? rows : (rows?.items || []))[0];
    if (!listing || !recordInScope(listing, false) || !isPubliclyReachable(listing)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const asset = (listing.selected_media || []).find((m: any) => String(m.drive_file_id) === fileId);
    if (!asset) return Response.json({ error: "Not found" }, { status: 404 });
    if (asset.kind === "video" && listing.include_video !== true) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    // A photograph is served as a web-sized derivative of the delivered file. A page of twenty
    // originals (tens of megabytes each) never finishes loading on a phone — the browser gives up
    // and shows an empty frame. The resized copy is read from the same private Drive file with the
    // same credentials, so nothing is copied, re-uploaded or made publicly addressable, and the
    // client's own gallery still hands them the originals. Video is streamed exactly as delivered.
    if (asset.kind === "photo") {
      const preview = await fetchJobPhotoPreview(base44, fileId);
      if (preview) {
        return new Response(preview.bytes, {
          status: 200,
          headers: {
            "Content-Type": preview.mimeType,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }

    const file = await fetchJobFile(base44, fileId);
    if (!file) return Response.json({ error: "Asset unavailable" }, { status: 404 });

    return new Response(file.bytes, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Cache-Control": "public, max-age=86400",
        "Content-Disposition": `inline; filename="${String(file.name).replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});