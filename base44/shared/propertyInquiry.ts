// Property inquiry handling — the single implementation, used by both surfaces.
//
//   submitPropertyInquiry — the ordinary public surface. Real, published, available listings only:
//                           it cannot be put into a mode that resolves a synthetic record.
//   certifyPropertyRender — the certification-only surface. Synthetic records owned by the acting
//                           administrator's own certification run.
//
// Both delegate here, so the certification path exercises the real validation, spam screening,
// routing and persistence logic rather than a copy of it. The public surface's own abuse controls
// (the per-IP rate limit) stay in the public endpoint, where the visitor's request headers exist.

import {
  INQUIRY_CONSENT_TEXT,
  INQUIRY_PRIVACY_DISCLOSURES,
  inquirySpamSignals,
  isValidEmail,
  sanitizeText,
} from "./propertyVisibility.ts";

export const MAX_INQUIRY_MESSAGE = 2000;

export interface ValidatedInquiry {
  slug: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  errors: string[];
}

// Field order is part of the response contract: property, name, email, message, consent.
export function validateInquiryInput(input: any): ValidatedInquiry {
  const slug = sanitizeText(input?.slug, 120);
  const name = sanitizeText(input?.name, 120);
  const email = sanitizeText(input?.email, 160).toLowerCase();
  const phone = sanitizeText(input?.phone, 40);
  const message = sanitizeText(input?.message, MAX_INQUIRY_MESSAGE);

  const errors: string[] = [];
  if (!slug) errors.push("property");
  if (name.length < 2) errors.push("name");
  if (!isValidEmail(email)) errors.push("email");
  if (message.length < 10) errors.push("message");
  if (input?.consent_privacy !== true) errors.push("consent");

  return { slug, name, email, phone, message, errors };
}

export function inquiryValidationFailure(fields: string[]) {
  return {
    status: 400,
    body: {
      ok: false,
      reason: "VALIDATION_FAILED",
      fields,
      message: "Please complete the required fields.",
    },
  };
}

/**
 * Screen, route and record an inquiry that has already passed validation.
 *
 * Routing goes to the authorized listing contact ONLY. Nothing is routed anywhere else, and no
 * lead is shared across apps — cross-app lead sharing stays off until explicitly approved.
 */
export async function submitValidatedInquiry(client: any, opts: {
  listing: any;
  validated: ValidatedInquiry;
  honeypot?: string;
  certification: boolean;
  ipHash?: string;
  userAgentHash?: string;
}): Promise<{ status: number; body: any }> {
  const { listing, validated, certification } = opts;
  const { slug, name, email, phone, message } = validated;

  const spam = inquirySpamSignals({ name, email, message, honeypot: opts.honeypot });
  if (spam.flags.includes("honeypot")) {
    // Silently accept and drop: a bot gets no signal that it was filtered.
    return { status: 200, body: { ok: true, reference: null, filtered: true } };
  }

  // Route ONLY to the authorized listing contact.
  const routedTo = sanitizeText(listing.approved_contact_email || listing.agent_email || "", 160);
  if (!routedTo || !isValidEmail(routedTo)) {
    return { status: 409, body: { ok: false, reason: "NO_AUTHORIZED_CONTACT", message: "This listing has no authorized contact configured." } };
  }

  const inquiryId = `inq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const created = await client.asServiceRole.entities.PropertyInquiry.create({
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
    ip_hash: opts.ipHash || "",
    user_agent_hash: opts.userAgentHash || "",
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
    certification_mode: certification === true,
    created_at: new Date().toISOString(),
  });

  await client.asServiceRole.entities.PropertyListing.update(listing.id, {
    inquiry_count: (listing.inquiry_count || 0) + 1,
    updated_at: new Date().toISOString(),
  });
  await client.asServiceRole.entities.PropertyListingEvent.create({
    event_id: `plev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    listing_id: listing.listing_id,
    event_type: "inquiry_received",
    actor: "visitor",
    actor_type: "visitor",
    previous_state: listing.publication_state,
    new_state: listing.publication_state,
    details: { inquiry_id: inquiryId, routed_to: routedTo, spam_score: spam.score },
    recorded_at: new Date().toISOString(),
    certification_mode: certification === true,
  });

  return {
    status: 200,
    body: {
      ok: true,
      reference: created.property_reference,
      routed_to_listing_contact: true,
      message: "Your inquiry has been sent to the listing contact.",
    },
  };
}