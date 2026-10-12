import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  PROPERTY_FEATURE_FLAG_KEY,
  PUBLICATION_CONSENT_TEXT,
  ADVERTISING_DISCLOSURES,
  AVAILABLE_LISTING_STATUSES,
  buildSlug,
  buildStructuredData,
  contentHash,
  duplicateKey,
  estimateCostPerProperty,
  generateSeoDraft,
  isJobEligibleForPropertyPage,
  recordInScope,
  resolveFeatureGate,
  testModeRequested,
  canActorAccessListing,
  canApprovePublication,
  nextConfirmationDue,
  normalizeAddress,
  normalizeSelection,
  propertyPageUrl,
  resoProjection,
  sanitizeText,
  seoSourceHash,
  transitionError,
} from "../../shared/propertyVisibility.ts";
import { listJobFiles } from "../../shared/jobMedia.ts";
import { purgeListingFromEdge } from "../../shared/edgeCache.ts";

// Customer-facing (and admin) authoring of a property page.
//
// Authorization for a customer is the SAME rule the delivery gallery uses: the acting email
// must match job.client_email / listing.client_email. Admins act through Base44 auth.
//
// Publication approval is customer-only: an admin may review and return a page to draft, but
// only the authorized customer can approve publication (requirement: only an authorized
// customer may approve publication).
//
// While the feature flag is false the customer-facing actions are refused outright; admin
// actions stay available so certification and QA can run behind the flag.

const DETAIL_FIELDS = [
  "property_address", "city", "state", "zip", "listing_price", "bedrooms", "bathrooms",
  "square_footage", "property_type", "property_description", "amenities",
];

// A change to one of these before publication invalidates the approved factual content.
const CONTENT_SENSITIVE_FIELDS = new Set(DETAIL_FIELDS);

function nowIso() { return new Date().toISOString(); }

async function recordEvent(base44: any, listing: any, eventType: string, actor: any, details: any = {}, states: any = {}) {
  await base44.asServiceRole.entities.PropertyListingEvent.create({
    event_id: `plev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    listing_id: listing.listing_id,
    event_type: eventType,
    actor: actor.email,
    actor_type: actor.type,
    previous_state: states.previous_state ?? listing.publication_state,
    new_state: states.new_state ?? listing.publication_state,
    details,
    recorded_at: nowIso(),
    certification_mode: listing.certification_mode === true,
  });
}

async function resolveActor(base44: any, body: any) {
  let adminEmail = null;
  try {
    const me = await base44.auth.me();
    if (me && me.role === "admin") adminEmail = me.email;
  } catch {
    adminEmail = null;
  }
  const clientEmail = String(body?.clientEmail || "").trim().toLowerCase();

  // This app's own administrators are not platform users: the owner and staff sign in through the
  // sales console and live in SalesTeamMember, so an administrator identity is verified against
  // that table (active, role admin) rather than taken from a body field.
  let staffAdmin: any = null;
  const claimedId = String(body?.sales_member_id || "").trim();
  const claimedEmail = String(body?.admin_email || body?.sales_member_email || "").trim();
  if (claimedId || claimedEmail) {
    try {
      const rows = claimedId
        ? await base44.asServiceRole.entities.SalesTeamMember.filter({ id: claimedId })
        : await base44.asServiceRole.entities.SalesTeamMember.filter({ email: claimedEmail });
      const member = (Array.isArray(rows) ? rows : [])[0];
      if (member && member.role === "admin" && member.is_active !== false) staffAdmin = member;
    } catch {
      staffAdmin = null;
    }
  }

  // A service-role call carries a synthetic platform identity. When the caller names one of THIS
  // app's own administrators, that real person is the actor and the platform identity is kept only
  // as the executor, so the record always names a human from the app's own user table.
  const isSystemSession = !adminEmail || /@no-reply\.base44\.com$/i.test(String(adminEmail));
  const actingEmail = (!isSystemSession && adminEmail) ? adminEmail : (staffAdmin ? staffAdmin.email : (adminEmail || ""));
  if (actingEmail) {
    // Acting for a customer is only ever an administrator path: it must name that customer's own
    // page and state the basis. Both are recorded on every event the action writes, so an
    // on-behalf action is never attributed to the customer as though they had taken it themselves.
    return {
      email: actingEmail,
      type: "admin",
      isAdmin: true,
      clientEmail,
      onBehalfOf: String(body?.on_behalf_of_client || "").trim().toLowerCase(),
      basis: sanitizeText(body?.consent_basis, 300),
      executedBy: isSystemSession ? String(adminEmail || "service_role") : "",
    };
  }
  return { email: clientEmail, type: "customer", isAdmin: false, clientEmail };
}

// An administrator recording something on the customer's behalf: only for that customer's own page,
// and only with the basis stated. Without all three this is false, and the customer-only rules below
// continue to refuse an administrator acting on their own initiative.
function onBehalfApproval(listing: any, actor: any) {
  return actor.isAdmin === true
    && !!actor.onBehalfOf
    && actor.onBehalfOf === String(listing.client_email || "").toLowerCase()
    && !!actor.basis;
}

function authorizeListing(listing: any, actor: any) {
  return canActorAccessListing(listing, actor);
}

async function buildFactsFromBooking(base44: any, job: any) {
  const bookingId = job.booking_id || job.from_booking;
  if (!bookingId) return null;
  try {
    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    if (!booking) return null;
    return {
      booking_id: booking.id,
      property_address: booking.property_address || booking.street_address || "",
      city: booking.city || "",
      state: booking.state || "",
      zip: "",
      square_footage: booking.property_sqft ?? null,
      square_footage_source: booking.property_sqft_verified ? "verified_booking_data" : (booking.property_sqft ? "booking_data" : ""),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const actor = await resolveActor(base44, body);
    // Production reads the feature flag. A certification run opts into test mode, which only
    // ever operates on certification records and never writes the production flag.
    const gate = await resolveFeatureGate(base44, testModeRequested(body.test_mode));
    const flagEnabled = gate.enabled;
    const certScope = gate.test_mode;
    const inScope = (candidate: any) => recordInScope(candidate, certScope);

    // Customer-facing authoring stays dark until the flag is switched on.
    if (!actor.isAdmin && !flagEnabled) {
      return Response.json({
        ok: false,
        feature_disabled: true,
        feature_flag: PROPERTY_FEATURE_FLAG_KEY,
        message: "Property Visibility is not yet enabled for customers.",
      });
    }

    const listings = base44.asServiceRole.entities.PropertyListing;

    // ------------------------------------------------------------------ get context
    if (action === "get_context") {
      const jobId = String(body.jobId || "");
      if (!jobId) return Response.json({ error: "jobId is required" }, { status: 400 });
      const job = await base44.asServiceRole.entities.Job.get(jobId).catch(() => null);
      if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
      const ownsJob = actor.isAdmin || String(job.client_email || "").toLowerCase() === actor.clientEmail;
      if (!ownsJob) return Response.json({ error: "Unauthorized: this job does not belong to you" }, { status: 403 });

      const eligibility = isJobEligibleForPropertyPage(job);
      const existing = (await listings.filter({ job_id: jobId })) || [];
      const bookingFacts = await buildFactsFromBooking(base44, job);
      const existingListing = existing.find((l: any) => inScope(l)) || null;
      const missing: string[] = [];
      if (!(bookingFacts?.property_address)) missing.push("property_address");
      if (!(bookingFacts?.city)) missing.push("city");
      if (!(bookingFacts?.state)) missing.push("state");
      ["listing_price", "bedrooms", "bathrooms"].forEach((f) => {
        if (!existingListing?.[f]) missing.push(f);
      });

      return Response.json({
        ok: true,
        feature_enabled: flagEnabled,
        eligible: eligibility.eligible,
        ineligible_reason: eligibility.reason || null,
        job: {
          id: job.id,
          title: job.title,
          location: job.location,
          date: job.date,
          production_status: job.production_status,
          client_email: job.client_email,
        },
        suggested_facts: bookingFacts,
        missing_facts: missing,
        existing_listing: existingListing,
        cost_estimate: estimateCostPerProperty(existingListing || undefined),
      });
    }

    // ------------------------------------------------------------------ create draft
    if (action === "create_draft") {
      const jobId = String(body.jobId || "");
      const job = await base44.asServiceRole.entities.Job.get(jobId).catch(() => null);
      if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
      const ownsJob = actor.isAdmin || String(job.client_email || "").toLowerCase() === actor.clientEmail;
      if (!ownsJob) return Response.json({ error: "Unauthorized: this job does not belong to you" }, { status: 403 });

      const eligibility = isJobEligibleForPropertyPage(job);
      if (!eligibility.eligible) {
        return Response.json({
          ok: false,
          reason: eligibility.reason,
          message: "This order is not eligible: edited media must be approved and delivered first.",
        }, { status: 409 });
      }

      // Duplicate page prevention: one property page per job / per property address.
      const byJob = (await listings.filter({ job_id: jobId })) || [];
      const reusable = byJob.find((l: any) => inScope(l));
      if (reusable) return Response.json({ ok: true, listing: reusable, reused: true });

      const facts = (await buildFactsFromBooking(base44, job)) || {};
      const address = normalizeAddress(facts.property_address || job.location || "");
      if (!address) {
        return Response.json({
          ok: false,
          reason: "PROPERTY_ADDRESS_REQUIRED",
          message: "A property address is required. Please add it to the property details.",
        }, { status: 409 });
      }

      const listingId = `prop_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const dkey = duplicateKey(jobId, address);
      const existingByKey = (await listings.filter({ duplicate_key: dkey })) || [];
      const duplicate = existingByKey.find((l: any) => inScope(l));
      if (duplicate) return Response.json({ ok: true, listing: duplicate, reused: true });

      const slug = buildSlug(address, facts.city || "", facts.state || "", listingId);
      const created = await listings.create({
        listing_id: listingId,
        tenant_id: job.tenant_id || "tnt_estate_media",
        job_id: jobId,
        booking_id: facts.booking_id || "",
        duplicate_key: dkey,
        client_email: job.client_email,
        client_name: job.client_name || "",
        property_address: address,
        normalized_address: address,
        city: facts.city || "",
        state: facts.state || "",
        zip: facts.zip || "",
        square_footage: facts.square_footage ?? null,
        square_footage_source: facts.square_footage_source || "",
        listing_price: null,
        bedrooms: null,
        bathrooms: null,
        property_type: "",
        property_description: "",
        amenities: [],
        listing_status: "draft",
        agent_email: "",
        selected_media: [],
        cover_file_id: "",
        include_video: false,
        publication_state: "DRAFT",
        publication_history: [{ from_state: null, to_state: "DRAFT", at: nowIso(), actor: actor.email, note: "created" }],
        ai_generation_count: 0,
        inquiry_count: 0,
        sitemap_included: false,
        public_slug: slug,
        public_url: propertyPageUrl(slug),
        canonical_url: propertyPageUrl(slug),
        disclosures_snapshot: ADVERTISING_DISCLOSURES.join("\n"),
        reso: resoProjection({ listing_id: listingId, listing_status: "draft", property_type: "" }),
        certification_mode: certScope,
        certification_run_id: certScope ? sanitizeText(body.certification_run_id, 120) : "",
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      await recordEvent(base44, created, "listing_created", actor, { job_id: jobId, address });
      return Response.json({ ok: true, listing: created, created: true });
    }

    // ------------------------------------------------------------------ load listing for the remaining actions
    const listingId = String(body.listingId || "");
    let listing = listingId
      ? (await listings.filter({ listing_id: listingId }))?.[0] || null
      : null;
    if (!listing && listingId) {
      listing = await listings.get(listingId).catch(() => null);
    }
    if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });
    if (!authorizeListing(listing, actor)) {
      return Response.json({ error: "Unauthorized: this property page does not belong to you" }, { status: 403 });
    }
    if (listing.certification_mode === true && !actor.isAdmin && !certScope) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const update = async (data: any, eventType: string, details: any = {}, states: any = {}) => {
      const patch = { ...data, updated_at: nowIso() };
      await listings.update(listing.id, patch);
      const fresh = { ...listing, ...patch };
      await recordEvent(base44, fresh, eventType, actor, details, states);
      listing = fresh;
      // Any state, content or media change invalidates the exact edge keys for this listing:
      // its page, the sitemap, and every media asset it can currently expose. Invalidating here
      // covers publishing, unpublishing, archiving, listing-status changes and media
      // authorization changes in one place. Inert until the edge secrets exist, and never
      // allowed to fail the customer action.
      const edgePurge = await purgeListingFromEdge(fresh);
      if (edgePurge && edgePurge.ok === false && edgePurge.skipped !== true) {
        console.log(`edge purge failed for ${fresh.listing_id}: ${edgePurge.error || edgePurge.status}`);
      }
      return fresh;
    };

    // ------------------------------------------------------------------ details
    if (action === "update_details") {
      const incoming = body.details || {};
      const patch: Record<string, any> = {};
      for (const field of DETAIL_FIELDS) {
        if (!(field in incoming)) continue;
        if (field === "amenities") {
          patch.amenities = Array.isArray(incoming.amenities)
            ? incoming.amenities.map((a: any) => sanitizeText(a, 80)).filter(Boolean).slice(0, 30)
            : [];
        } else if (["listing_price", "square_footage", "bedrooms", "bathrooms"].includes(field)) {
          // Never invented: an empty value clears the field rather than defaulting it.
          patch[field] = incoming[field] === "" || incoming[field] == null ? null : Number(incoming[field]);
        } else {
          patch[field] = sanitizeText(incoming[field], 2000);
        }
      }
      if (patch.property_address) patch.normalized_address = normalizeAddress(patch.property_address);

      const contentChanged = Object.keys(patch).some((f) => CONTENT_SENSITIVE_FIELDS.has(f));
      // Before publication a content change invalidates the previously approved content.
      if (contentChanged && ["READY_FOR_REVIEW", "APPROVED"].includes(listing.publication_state)) {
        patch.content_approved_at = null;
        patch.content_approved_by = "";
        if (listing.publication_state === "APPROVED") {
          patch.publication_state = "READY_FOR_REVIEW";
          patch.approval_timestamp = null;
        }
      }
      await update(patch, "details_updated", { fields: Object.keys(patch), reapproval_required: contentChanged });
      return Response.json({ ok: true, listing });
    }

    // ------------------------------------------------------------------ media selection
    if (action === "save_media") {
      const job = await base44.asServiceRole.entities.Job.get(listing.job_id).catch(() => null);
      if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

      // The job's delivered folder is the allow-list: only delivered media for THIS job may be
      // selected, so no other asset can ever reach a public page.
      const { files } = await listJobFiles(base44, job);
      const allowed = new Map(files.map((f) => [f.id, f]));

      // Selection is normalised by the shared engine: only files from the delivered folder,
      // only photographs and video, positions renumbered, cover falling back to the first photo.
      const { selected, cover, rejected, photo_count, video_count } = normalizeSelection(
        body.selected_media,
        allowed,
        body.cover_file_id,
      );

      // Nothing is saved on an empty selection: at least one delivered photograph is required,
      // and any file that is not in the job's delivered folder has already been dropped above.
      if (!selected.length) {
        return Response.json({
          ok: false,
          reason: "MEDIA_SELECTION_REQUIRED",
          message: "Select at least one delivered photograph for the property page.",
        }, { status: 409 });
      }

      const includeVideo = body.include_video === true && selected.some((m: any) => m.kind === "video");
      await update(
        { selected_media: selected, cover_file_id: cover, include_video: includeVideo, media_selection_approved_at: nowIso() },
        "media_selection_saved",
        { photos: photo_count, videos: video_count, include_video: includeVideo },
      );
      return Response.json({ ok: true, listing, rejected });
    }

    // ------------------------------------------------------------------ SEO draft (cost-gated)
    if (action === "generate_seo") {
      if (!listing.selected_media?.length) {
        return Response.json({ ok: false, reason: "MEDIA_SELECTION_REQUIRED", message: "Select media before generating page content." }, { status: 409 });
      }
      const sourceHash = await seoSourceHash(listing);
      // Content is generated once and regenerated only when relevant information changes.
      if (!body.force && listing.seo_source_hash === sourceHash && listing.ai_draft?.generated_at) {
        return Response.json({ ok: true, listing, cached: true, ai_calls: 0 });
      }
      const draft = await generateSeoDraft(base44, listing);
      const altTexts = Array.isArray(draft?.alt_texts) ? draft.alt_texts : [];
      const media = (listing.selected_media || []).map((m: any) => {
        const match = altTexts.find((a: any) => String(a?.drive_file_id) === String(m.drive_file_id));
        return { ...m, alt_text: sanitizeText(match?.alt_text || m.alt_text || "", 200) };
      });
      await update({
        ai_draft: {
          property_description: sanitizeText(draft?.property_description, 4000),
          seo_title: sanitizeText(draft?.seo_title, 120),
          meta_description: sanitizeText(draft?.meta_description, 200),
          alt_texts: altTexts,
          generated_at: nowIso(),
        },
        selected_media: media,
        seo_source_hash: sourceHash,
        ai_generation_count: (listing.ai_generation_count || 0) + 1,
      }, "seo_generated", { ai_calls: 1, source_hash: sourceHash });
      return Response.json({ ok: true, listing, cached: false, ai_calls: 1 });
    }

    // ------------------------------------------------------------------ customer approves factual content
    if (action === "approve_content") {
      const incoming = body.content || {};
      const description = sanitizeText(incoming.property_description ?? listing.ai_draft?.property_description ?? listing.property_description, 4000);
      const title = sanitizeText(incoming.seo_title ?? listing.ai_draft?.seo_title ?? listing.seo_title, 120);
      const metaDescription = sanitizeText(incoming.meta_description ?? listing.ai_draft?.meta_description ?? listing.meta_description, 200);
      if (!description || !title || !metaDescription) {
        return Response.json({ ok: false, reason: "CONTENT_INCOMPLETE", message: "A description, page title and meta description are all required." }, { status: 409 });
      }
      const altTexts = Array.isArray(incoming.alt_texts) ? incoming.alt_texts : null;
      const media = altTexts
        ? (listing.selected_media || []).map((m: any) => {
            const match = altTexts.find((a: any) => String(a?.drive_file_id) === String(m.drive_file_id));
            return match ? { ...m, alt_text: sanitizeText(match.alt_text, 200) } : m;
          })
        : listing.selected_media;

      const merged: any = { ...listing, property_description: description, seo_title: title, meta_description: metaDescription, selected_media: media };
      const hash = await contentHash(merged);
      const sourceHash = await seoSourceHash(merged);
      const url = propertyPageUrl(listing.public_slug);
      await update({
        property_description: description,
        seo_title: title,
        meta_description: metaDescription,
        selected_media: media,
        structured_data: buildStructuredData(merged, url),
        canonical_url: url,
        content_hash: hash,
        seo_source_hash: sourceHash,
        seo_generated_at: nowIso(),
        content_approved_at: nowIso(),
        content_approved_by: actor.email,
      }, "content_approved", { approved_by: actor.email });
      return Response.json({ ok: true, listing });
    }

    // ------------------------------------------------------------------ authority, brokerage, disclosures
    if (action === "record_authorizations") {
      const patch: Record<string, any> = {};
      if (body.agent_name !== undefined) patch.agent_name = sanitizeText(body.agent_name, 120);
      if (body.agent_email !== undefined) patch.agent_email = sanitizeText(body.agent_email, 160);
      if (body.agent_phone !== undefined) patch.agent_phone = sanitizeText(body.agent_phone, 40);
      if (body.agent_license_number !== undefined) patch.agent_license_number = sanitizeText(body.agent_license_number, 60);
      if (body.brokerage_name !== undefined) patch.brokerage_name = sanitizeText(body.brokerage_name, 160);
      if (body.approved_contact_email !== undefined) patch.approved_contact_email = sanitizeText(body.approved_contact_email || body.agent_email, 160);
      if (body.approved_contact_phone !== undefined) patch.approved_contact_phone = sanitizeText(body.approved_contact_phone || body.agent_phone, 40);

      const events: string[] = [];
      if (body.authority_confirmed === true) {
        patch.authority_confirmed = true;
        patch.authority_confirmed_at = nowIso();
        patch.authority_confirmed_by = actor.email;
        events.push("authority_confirmed");
      }
      if (body.brokerage_approved === true) {
        patch.brokerage_approved = true;
        patch.brokerage_approved_at = nowIso();
        events.push("brokerage_approved");
      }
      if (body.disclosures_accepted === true) {
        patch.disclosures_accepted = true;
        patch.disclosures_accepted_at = nowIso();
        patch.disclosures_snapshot = ADVERTISING_DISCLOSURES.join("\n");
        events.push("disclosures_accepted");
      }
      if (!Object.keys(patch).length) {
        return Response.json({ ok: false, reason: "NOTHING_TO_RECORD", message: "No authorization data supplied." }, { status: 400 });
      }
      await update(patch, events[0] || "details_updated", { events });
      return Response.json({ ok: true, listing });
    }

    // ------------------------------------------------------------------ submit for review
    if (action === "submit_for_review") {
      const err = transitionError(listing.publication_state, "READY_FOR_REVIEW");
      if (err) return Response.json({ ok: false, reason: "INVALID_TRANSITION", message: err }, { status: 409 });
      const missing: string[] = [];
      if (!listing.selected_media?.length) missing.push("media");
      if (!listing.content_approved_at) missing.push("approved_content");
      if (!listing.agent_name || !(listing.approved_contact_email || listing.agent_email)) missing.push("listing_contact");
      if (missing.length) return Response.json({ ok: false, reason: "PREREQUISITES_MISSING", missing, message: "Complete the property page before submitting it for review." }, { status: 409 });
      await update({ publication_state: "READY_FOR_REVIEW" }, "submitted_for_review", { missing: [] }, { previous_state: listing.publication_state, new_state: "READY_FOR_REVIEW" });
      return Response.json({ ok: true, listing });
    }

    // ------------------------------------------------------------------ admin internal review (never publication approval)
    if (action === "admin_review") {
      if (!actor.isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
      const decision = String(body.decision || "note");
      if (decision === "return_to_draft") {
        const err = transitionError(listing.publication_state, "DRAFT");
        if (err) return Response.json({ ok: false, reason: "INVALID_TRANSITION", message: err }, { status: 409 });
        await update({ publication_state: "DRAFT" }, "submitted_for_review", { decision, notes: sanitizeText(body.notes, 500) }, { previous_state: listing.publication_state, new_state: "DRAFT" });
      } else {
        await update({}, "submitted_for_review", { decision: "note", notes: sanitizeText(body.notes, 500) });
      }
      return Response.json({ ok: true, listing });
    }

    // ------------------------------------------------------------------ publication approval (customer only)
    if (action === "approve_publication") {
      // Customer-only by default. An administrator cannot approve on their own initiative; they may
      // only record an approval ON the authorized customer's behalf, for that customer's own page,
      // with the basis stated — and the record then names the administrator as the approving account.
      const onBehalf = onBehalfApproval(listing, actor);
      if (!canApprovePublication(actor) && !onBehalf) {
        return Response.json({
          ok: false,
          reason: "CUSTOMER_APPROVAL_REQUIRED",
          message: "Publication must be approved by the authorized customer account.",
        }, { status: 403 });
      }
      if (onBehalf && !actor.basis) {
        return Response.json({ ok: false, reason: "CONSENT_BASIS_REQUIRED", message: "State the basis for recording approval on the customer's behalf." }, { status: 409 });
      }
      if (body.consent !== true) {
        return Response.json({ ok: false, reason: "CONSENT_REQUIRED", message: "Explicit publication consent is required." }, { status: 409 });
      }
      const err = transitionError(listing.publication_state, "APPROVED");
      if (err) return Response.json({ ok: false, reason: "INVALID_TRANSITION", message: err }, { status: 409 });

      const missing: string[] = [];
      if (!listing.content_approved_at) missing.push("approved_content");
      if (!listing.selected_media?.length) missing.push("media");
      if (!listing.cover_file_id) missing.push("cover");
      if (!listing.authority_confirmed) missing.push("agent_authority");
      if (!listing.brokerage_approved) missing.push("brokerage_approval");
      if (!listing.disclosures_accepted) missing.push("disclosures");
      if (!(listing.approved_contact_email || listing.agent_email)) missing.push("listing_contact");
      if (!listing.seo_title || !listing.meta_description) missing.push("seo_metadata");
      if (missing.length) return Response.json({ ok: false, reason: "PREREQUISITES_MISSING", missing, message: "The property page is not ready for publication approval." }, { status: 409 });

      const approvalHistory = [...(listing.publication_history || []), {
        from_state: listing.publication_state,
        to_state: "APPROVED",
        at: nowIso(),
        actor: actor.email,
        note: onBehalf
          ? `publication approved on the customer's behalf by administrator ${actor.email}; basis: ${actor.basis}`
          : "publication approved by the authorized customer",
      }];
      await update({
        publication_state: "APPROVED",
        publication_history: approvalHistory,
        approving_account: actor.email,
        approval_timestamp: nowIso(),
        publication_consent: PUBLICATION_CONSENT_TEXT,
        publication_consent_at: nowIso(),
        approved_property_details_snapshot: DETAIL_FIELDS.reduce((acc: any, f) => ({ ...acc, [f]: listing[f] ?? null }), {}),
        approved_media_snapshot: listing.selected_media,
      }, "publication_approved", {
        approving_account: actor.email,
        approved_media: (listing.selected_media || []).length,
        ...(onBehalf
          ? { recorded_on_behalf_of: listing.client_email, basis: actor.basis, customer_consent_recorded: false }
          : {}),
      }, { previous_state: listing.publication_state, new_state: "APPROVED" });
      return Response.json({ ok: true, listing });
    }

    // ------------------------------------------------------------------ publish
    if (action === "publish") {
      const onBehalf = onBehalfApproval(listing, actor);
      if (actor.isAdmin && !onBehalf) {
        return Response.json({ ok: false, reason: "CUSTOMER_APPROVAL_REQUIRED", message: "Publication must be approved by the authorized customer account." }, { status: 403 });
      }
      if (listing.publication_state === "PUBLISHED") return Response.json({ ok: true, listing, already_published: true });
      const err = transitionError(listing.publication_state, "PUBLISHED");
      if (err) return Response.json({ ok: false, reason: "INVALID_TRANSITION", message: err }, { status: 409 });
      if (!listing.publication_consent_at) return Response.json({ ok: false, reason: "APPROVAL_REQUIRED", message: "Record publication approval before publishing." }, { status: 409 });

      const history = [...(listing.publication_history || []), { from_state: listing.publication_state, to_state: "PUBLISHED", at: nowIso(), actor: actor.email, note: "published" }];
      await update({
        publication_state: "PUBLISHED",
        published_at: nowIso(),
        publication_history: history,
        last_status_confirmed_at: nowIso(),
        last_status_confirmed_by: actor.email,
        status_confirmation_due_at: nextConfirmationDue(),
        listing_status: AVAILABLE_LISTING_STATUSES.includes(listing.listing_status) ? listing.listing_status : "active",
        sitemap_included: true,
      }, "published", { url: listing.public_url }, { previous_state: listing.publication_state, new_state: "PUBLISHED" });
      return Response.json({ ok: true, listing });
    }

    // ------------------------------------------------------------------ unpublish / archive
    if (action === "unpublish") {
      const err = transitionError(listing.publication_state, "UNPUBLISHED");
      if (err) return Response.json({ ok: false, reason: "INVALID_TRANSITION", message: err }, { status: 409 });
      const history = [...(listing.publication_history || []), { from_state: listing.publication_state, to_state: "UNPUBLISHED", at: nowIso(), actor: actor.email, note: sanitizeText(body.reason, 200) }];
      await update({ publication_state: "UNPUBLISHED", unpublished_at: nowIso(), publication_history: history, sitemap_included: false }, "unpublished", { reason: sanitizeText(body.reason, 200) }, { previous_state: listing.publication_state, new_state: "UNPUBLISHED" });
      return Response.json({ ok: true, listing });
    }

    if (action === "archive") {
      const err = transitionError(listing.publication_state, "ARCHIVED");
      if (err) return Response.json({ ok: false, reason: "INVALID_TRANSITION", message: err }, { status: 409 });
      await update({ publication_state: "ARCHIVED", archived_at: nowIso(), sitemap_included: false }, "archived", {}, { previous_state: listing.publication_state, new_state: "ARCHIVED" });
      return Response.json({ ok: true, listing });
    }

    // ------------------------------------------------------------------ listing status lifecycle
    if (action === "update_listing_status") {
      const status = String(body.status || "");
      if (!["active", "pending", "sold", "withdrawn", "expired"].includes(status)) {
        return Response.json({ ok: false, reason: "INVALID_STATUS", message: `Unsupported listing status: ${status}` }, { status: 400 });
      }
      await update({
        listing_status: status,
        last_status_change_at: nowIso(),
        last_status_confirmed_at: nowIso(),
        last_status_confirmed_by: actor.email,
        status_confirmation_due_at: nextConfirmationDue(),
      }, "listing_status_changed", { from: listing.listing_status, to: status });
      return Response.json({ ok: true, listing });
    }

    if (action === "confirm_status") {
      await update({
        last_status_confirmed_at: nowIso(),
        last_status_confirmed_by: actor.email,
        status_confirmation_due_at: nextConfirmationDue(),
      }, "status_confirmed", { listing_status: listing.listing_status });
      return Response.json({ ok: true, listing });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});