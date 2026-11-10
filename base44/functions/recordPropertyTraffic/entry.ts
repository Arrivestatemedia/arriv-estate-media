import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { recordInScope, resolveFeatureGate, sanitizeText } from "../../shared/propertyVisibility.ts";
import {
  looksAutomated,
  normalizeAttribution,
  operatingDay,
  trafficBucketKey,
} from "../../shared/propertyAttribution.ts";

// Public page-view counting for a published property page.
//
// Cost shape: this is the ONLY per-view signal in the feature, and the page sends exactly one
// beacon per view, which is aggregated into one row per property per day per channel. Reading a
// month of traffic is therefore a handful of rows, not one row per visit. Bots and link-preview
// fetchers are dropped before anything is written, so a shared link does not inflate the figures.
//
// Nothing identifying is received or stored: no cookie, no device id, no IP. The beacon carries the
// listing, the campaign parameters already in the URL and the referring hostname.
//
// A cheaper path exists and is documented for the owner to authorize separately: counting in the
// existing Cloudflare Worker with an Analytics Engine dataset would remove this invocation
// entirely. That requires a worker redeploy, so it is not switched on here.

const MAX_VIEWS_PER_REQUEST = 1;

function firstRow(result: any): any {
  const list = Array.isArray(result) ? result : (result?.items || []);
  return list[0] || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // The beacon is sent as text/plain so the browser treats it as a simple request; a JSON body
    // from a fetch fallback is accepted too.
    const raw = await req.text().catch(() => "");
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    const gate = await resolveFeatureGate(base44, false);
    if (!gate.enabled) return Response.json({ ok: true, ignored: "FEATURE_DISABLED" });

    if (looksAutomated(req.headers.get("user-agent"))) {
      return Response.json({ ok: true, ignored: "AUTOMATED" });
    }

    const key = sanitizeText(body?.listing, 120);
    if (!key) return Response.json({ ok: true, ignored: "NO_LISTING" });

    const listings = base44.asServiceRole.entities.PropertyListing;
    let listing = firstRow(await listings.filter({ listing_id: key })) || firstRow(await listings.filter({ public_slug: key }));
    if (!listing || !recordInScope(listing, false)) return Response.json({ ok: true, ignored: "UNKNOWN_LISTING" });
    // Only a published page is counted: a draft, an unpublished page and an archived page have no
    // public audience, and a sold or unconfirmed page keeps its historical views untouched.
    if (listing.publication_state !== "PUBLISHED") return Response.json({ ok: true, ignored: "NOT_PUBLISHED" });

    const attribution = normalizeAttribution(body?.attribution || {});
    const day = operatingDay();
    const channel = attribution.channel;
    const bucketKey = trafficBucketKey(listing.listing_id, day, channel);
    const sourceLabel = sanitizeText(attribution.utm_source || attribution.referrer_host || "direct", 80);
    const campaign = sanitizeText(attribution.utm_campaign, 80);

    const traffic = base44.asServiceRole.entities.PropertyTrafficDaily;
    const nowIso = new Date().toISOString();
    const existing = firstRow(await traffic.filter({ bucket_key: bucketKey }));

    if (existing) {
      // One atomic increment. Reporting sums every row for a bucket, so two simultaneous first
      // views that both created a row still produce a correct total.
      await traffic.updateMany({ bucket_key: bucketKey }, { $inc: { views: MAX_VIEWS_PER_REQUEST }, $set: { updated_at: nowIso } });
    } else {
      await traffic.create({
        bucket_key: bucketKey,
        listing_id: listing.listing_id,
        day,
        channel,
        source_label: sourceLabel,
        campaign,
        views: MAX_VIEWS_PER_REQUEST,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    return Response.json({ ok: true, counted: true });
  } catch (error: any) {
    // A counting failure must never surface to a visitor or break the page.
    return Response.json({ ok: true, error: String(error?.message || error) });
  }
});