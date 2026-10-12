import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  isPubliclyActive,
  recordInScope,
  resolveFeatureGate,
  sha256Hex,
} from "../../shared/propertyVisibility.ts";
import {
  inquiryValidationFailure,
  submitValidatedInquiry,
  validateInquiryInput,
} from "../../shared/propertyInquiry.ts";

// Public buyer inquiry submission.
//
// Rules: validated input, honeypot + heuristic spam screening, a hard per-IP rate limit, and
// routing to the authorized listing contact ONLY. Nothing is routed anywhere else, and no
// lead is shared across apps — cross-app lead sharing stays off until explicitly approved.

const RATE_LIMIT_PER_HOUR = 5;
const MAX_MESSAGE = 2000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // ABSOLUTE BLOCK on synthetic records: this endpoint accepts no test-mode parameter, so no
    // request can put it into a mode that resolves a certification record. Production scope governs
    // every call; certification submits through its own administrator-authorized endpoint.
    const gate = await resolveFeatureGate(base44, false);
    if (!gate.enabled) {
      return Response.json({ ok: false, feature_disabled: true, message: "Property inquiries are not yet available." }, { status: 404 });
    }

    const validated = validateInquiryInput(body);
    if (validated.errors.length) {
      const failure = inquiryValidationFailure(validated.errors);
      return Response.json(failure.body, { status: failure.status });
    }

    const rows = await base44.asServiceRole.entities.PropertyListing.filter({ public_slug: validated.slug });
    const listing = (Array.isArray(rows) ? rows : (rows?.items || []))[0];
    if (!listing || !recordInScope(listing, false) || !isPubliclyActive(listing)) {
      return Response.json({ ok: false, reason: "LISTING_NOT_AVAILABLE", message: "This property is no longer accepting inquiries." }, { status: 404 });
    }

    const forwarded = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const userAgent = String(req.headers.get("user-agent") || "");
    const ipHash = forwarded ? await sha256Hex(`${forwarded}|arriv_property_inquiry`) : "";

    // Rate limiting before any record is written.
    if (ipHash) {
      const since = new Date(Date.now() - 3600000).toISOString();
      const recent = await base44.asServiceRole.entities.PropertyInquiry.filter({
        ip_hash: ipHash,
        created_at: { $gte: since },
      });
      const count = (Array.isArray(recent) ? recent : (recent?.items || [])).length;
      if (count >= RATE_LIMIT_PER_HOUR) {
        return Response.json({ ok: false, reason: "RATE_LIMITED", message: "Too many inquiries submitted. Please try again later." }, { status: 429 });
      }
    }

    // Screening, routing and persistence live in the shared engine, so the certification-only path
    // exercises this exact logic without this endpoint ever reaching a synthetic record.
    const result = await submitValidatedInquiry(base44, {
      listing,
      validated,
      honeypot: body.company_website,
      certification: false,
      ipHash,
      userAgentHash: userAgent ? await sha256Hex(`${userAgent}|arriv_property_inquiry`) : "",
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});