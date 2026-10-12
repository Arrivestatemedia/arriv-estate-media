import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  INQUIRY_CONSENT_TEXT,
  INQUIRY_PRIVACY_DISCLOSURES,
  inquirySpamSignals,
  isPropertyVisibilityEnabled,
  isPubliclyActive,
  isValidEmail,
  sanitizeText,
  sha256Hex,
} from "../../shared/propertyVisibility.ts";

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

    if (!(await isPropertyVisibilityEnabled(base44))) {
      return Response.json({ ok: false, feature_disabled: true, message: "Property inquiries are not yet available." }, { status: 404 });
    }

    const slug = sanitizeText(body.slug, 120);
    const name = sanitizeText(body.name, 120);
    const email = sanitizeText(body.email, 160).toLowerCase();
    const phone = sanitizeText(body.phone, 40);
    const message = sanitizeText(body.message, MAX_MESSAGE);

    const errors: string[] = [];
    if (!slug) errors.push("property");
    if (name.length < 2) errors.push("name");
    if (!isValidEmail(email)) errors.push("email");
    if (message.length < 10) errors.push("message");
    if (body.consent_privacy !== true) errors.push("consent");
    if (errors.length) {
      return Response.json({ ok: false, reason: "VALIDATION_FAILED", fields: errors, message: "Please complete the required fields." }, { status: 400 });
    }

    const rows = await base44.asServiceRole.entities.PropertyListing.filter({ public_slug: slug });
    const listing = (Array.isArray(rows) ? rows : (rows?.items || []))[0];
    if (!listing || listing.certification_mode === true || !isPubliclyActive(listing)) {
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

    const spam = inquirySpamSignals({ name, email, message, honeypot: body.company_website });
    if (spam.flags.includes("honeypot")) {
      // Silently accept and drop: a bot gets no signal that it was filtered.
      return Response.json({ ok: true, reference: null, filtered: true });
    }

    // Route ONLY to the authorized listing contact.
    const routedTo = sanitizeText(listing.approved_contact_email || listing.agent_email || "", 160);
    if (!routedTo || !isValidEmail(routedTo)) {
      return Response.json({ ok: false, reason: "NO_AUTHORIZED_CONTACT", message: "This listing has no authorized contact configured." }, { status: 409 });
    }

    const inquiryId = `inq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const created = await base44.asServiceRole.entities.PropertyInquiry.create({
      inquiry_id: inquiryId,
      listing_id: listing.listing_id,
      public_slug: slug,
      property_reference: `ARRIV-${String(listing.listing_id || "").slice(-6).toUpperCase()}`,
      name,
      email,
      phone,
      message,
      consent_privacy: true,
      consent_text_snapshot: INQUIRY_CONSENT_TEXT,
      consent_at: new Date().toISOString(),
      privacy_disclosures: INQUIRY_PRIVACY_DISCLOSURES,
      source: "property_page",
      ip_hash: ipHash,
      user_agent_hash: userAgent ? await sha256Hex(`${userAgent}|arriv_property_inquiry`) : "",
      spam_score: spam.score,
      spam_flags: spam.flags,
      status: spam.score > 0 ? "review" : "routed",
      routed_to_email: routedTo,
      routed_at: new Date().toISOString(),
      // Recorded server-side; notification delivery to a listing agent who is not an app user
      // is a deferred item (it needs an authorized agent account or a custom email domain).
      notification_status: "pending_agent_delivery",
      lead_sharing_status: "not_shared",
      arriv_one_lead_id: "",
      certification_mode: false,
      created_at: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.PropertyListing.update(listing.id, {
      inquiry_count: (listing.inquiry_count || 0) + 1,
      updated_at: new Date().toISOString(),
    });
    await base44.asServiceRole.entities.PropertyListingEvent.create({
      event_id: `plev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      listing_id: listing.listing_id,
      event_type: "inquiry_received",
      actor: "visitor",
      actor_type: "visitor",
      previous_state: listing.publication_state,
      new_state: listing.publication_state,
      details: { inquiry_id: inquiryId, routed_to: routedTo, spam_score: spam.score },
      recorded_at: new Date().toISOString(),
      certification_mode: false,
    });

    return Response.json({
      ok: true,
      reference: created.property_reference,
      routed_to_listing_contact: true,
      message: "Your inquiry has been sent to the listing contact.",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});