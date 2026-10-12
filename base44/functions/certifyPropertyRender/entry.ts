import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { certificationAdminVerdict } from "../../shared/propertyCertRunGuard.ts";
import { propertyCertRunLockStatus } from "../../shared/propertyCertRunLock.ts";
import {
  CERT_PREFIX,
  isCertificationListingAvailable,
  isCertificationListingReachable,
} from "../../shared/propertyVisibility.ts";
import { buildPropertyPagePayload, renderPropertyPageHtml } from "../../shared/propertyPageRender.ts";
import {
  inquiryValidationFailure,
  submitValidatedInquiry,
  validateInquiryInput,
} from "../../shared/propertyInquiry.ts";

// CERTIFICATION-ONLY rendering and inquiry handling.
//
// The ordinary public surfaces (getPublicPropertyPage, submitPropertyInquiry, streamPropertyMedia)
// refuse synthetic certification listings absolutely: in every scope, with or without the
// certification test configuration, and whether or not a request asks for test mode. That block is
// deliberate and is NOT relaxed here or anywhere else.
//
// So that certification can still exercise the real rendering path and the real inquiry logic, this
// endpoint provides a separate, administrator-authorized path that proves three things BEFORE it
// reads or writes anything:
//
//   1. RUN OWNERSHIP — the caller is a platform administrator (server-verified session role) and is
//      the holder of the currently active certification run lock for the run id it names. A run id
//      that holds no lock is refused, so this path cannot be used outside a live certification run.
//   2. SYNTHETIC RECORD — the target listing is a certification record (certification_mode === true)
//      that belongs to that same run (certification_run_id === run id). A real listing is refused,
//      so a production page can never be exercised — or touched — through this path.
//   3. REACHABILITY — the record must be PUBLISHED, exactly as the public page requires.
//
// It shares the renderer and the inquiry engine with the public surfaces, so what certification
// exercises IS the real code; only the reach differs.

const ACTIONS = ["render", "inquire"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // 1. Platform administrator, from the verified session only — never from a body field.
    const user = await base44.auth.me().catch(() => null);
    const verdict = certificationAdminVerdict(user);
    if (!verdict.authorized) {
      return Response.json({ ok: false, authorized: false, error: verdict.reason }, { status: verdict.status });
    }
    const actorEmail = String(user?.email || "").toLowerCase();

    const runId = String(body.run_id || "");
    const action = String(body.action || "");
    if (!runId.startsWith(CERT_PREFIX)) {
      return Response.json({ ok: false, error: "A certification run id is required." }, { status: 403 });
    }
    if (!ACTIONS.includes(action)) {
      return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
    }

    // 2. Run ownership: the caller must hold THIS run's active lock.
    const lock = await propertyCertRunLockStatus(base44.asServiceRole);
    const ownsRun = lock.active === true
      && String(lock.run_id || "") === runId
      && String(lock.owner || "").toLowerCase() === actorEmail;
    if (!ownsRun) {
      return Response.json({
        ok: false,
        authorized: true,
        error: "This certification run is not owned by the caller, or is no longer active.",
        run_lock: { active: lock.active, run_id: lock.run_id || "", owner: lock.owner || "" },
      }, { status: 403 });
    }

    // 3. Synthetic-record validation: this run's own certification record, and nothing else.
    const listingId = String(body.listing_id || "");
    const rows = await base44.asServiceRole.entities.PropertyListing.filter({
      listing_id: listingId,
      certification_run_id: runId,
    });
    const listing = (Array.isArray(rows) ? rows : (rows?.items || []))[0];
    if (!listing || listing.certification_mode !== true || String(listing.certification_run_id || "") !== runId) {
      return Response.json({
        ok: false,
        authorized: true,
        error: "Only a synthetic certification record created by this run may be exercised through this path.",
      }, { status: 403 });
    }

    if (action === "render") {
      if (!isCertificationListingReachable(listing)) {
        return Response.json({ ok: false, error: "Property page not found" }, { status: 404 });
      }
      const payload = buildPropertyPagePayload(listing, {
        publiclyAvailable: isCertificationListingAvailable(listing),
      });
      if (String(body.format || "json") === "html") {
        return new Response(renderPropertyPageHtml(payload), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
    }

    // action === "inquire" — the real inquiry engine, exercised against this run's own record.
    const validated = validateInquiryInput({ ...body, slug: listing.public_slug });
    if (validated.errors.length) {
      const failure = inquiryValidationFailure(validated.errors);
      return Response.json(failure.body, { status: failure.status });
    }
    const result = await submitValidatedInquiry(base44, {
      listing,
      validated,
      honeypot: body.company_website,
      certification: true,
      // The certification caller is not a visitor: it carries no visitor IP or user agent, so no
      // personal data is hashed or stored by this path.
      ipHash: "",
      userAgentHash: "",
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});