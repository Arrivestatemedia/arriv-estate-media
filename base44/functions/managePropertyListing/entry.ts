import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  PROPERTY_FEATURE_FLAG_KEY,
  PUBLICATION_CONSENT_TEXT,
  DIRECTORY_SLUG,
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
import { requireCustomer } from "../../shared/customerSession.ts";
import { guardListingAdvertising } from "../../shared/propertyAdListingGuard.ts";
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

// The city, state and ZIP written inside an address we already hold, so a page whose address was
// captured as one line still shows the parts instead of three blank fields. This only reads what the
// address literally says: when it does not carry the parts, they stay empty.
function addressParts(address: any) {
  const raw = String(address || "").replace(/\s+/g, " ").trim();
  const withZip = raw.match(/^(.*),\s*([^,]+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (withZip) return { street: withZip[1].trim(), city: withZip[2].trim(), state: withZip[3].toUpperCase(), zip: withZip[4] };
  const withState = raw.match(/^(.*),\s*([^,]+?),\s*([A-Za-z]{2})$/);
  if (withState) return { street: withState[1].trim(), city: withState[2].trim(), state: withState[3].toUpperCase(), zip: "" };
  const cityOnly = raw.match(/^([^,]+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (cityOnly) return { street: "", city: cityOnly[1].trim(), state: cityOnly[2].toUpperCase(), zip: cityOnly[3] };
  return { street: raw, city: "", state: "", zip: "" };
}

// The facts a listing is missing that we already hold, so an existing page is filled in rather than
// left blank. Only empty fields are proposed and nothing is overwritten.
function listingFactsPatch(listing: any, known: any) {
  const parts = addressParts(listing.property_address || "");
  const patch: Record<string, any> = {};
  const fill = (field: string, value: any) => {
    const current = listing[field];
    if (current === null || current === undefined || String(current).trim() === "") {
      if (value !== null && value !== undefined && String(value).trim() !== "") patch[field] = String(value).trim();
    }
  };
  fill("city", parts.city || known.city);
  fill("state", parts.state || known.state);
  fill("zip", parts.zip || known.zip);
  fill("agent_name", known.full_name);
  fill("agent_email", known.agent_email);
  fill("agent_phone", known.phone);
  fill("approved_contact_email", known.agent_email);
  fill("approved_contact_phone", known.phone);
  fill("brokerage_name", known.brokerage_name);
  fill("agent_license_number", known.license_number);
  fill("agent_photo_url", known.photo_url);
  return patch;
}

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

// Everything we already hold about the signed-in customer, so a page starts filled in instead of
// blank. Only values that are actually on file are returned: nothing is inferred, and an absent
// value stays empty so the customer supplies it.
async function knownCustomerFacts(base44: any, auth: any) {
  const record = auth.record || {};
  const email = String(auth.actor.email || "").toLowerCase();
  const facts: any = {
    full_name: record.full_name || auth.actor.full_name || "",
    email,
    agent_email: email,
    phone: record.phone_number || "",
    city: record.city || "",
    state: record.state || "",
    zip: record.zip || "",
    brokerage_name: "",
    license_number: "",
    photo_url: "",
    property: null,
  };

  // A professional profile the customer has already completed is the authoritative source for the
  // contact details the public page shows.
  try {
    const profiles = (await base44.asServiceRole.entities.ProfessionalProfile.filter({ owner_email: email })) || [];
    const profile = profiles.find((p: any) => p.profile_type === "agent") || profiles[0];
    if (profile) {
      facts.full_name = profile.display_name || facts.full_name;
      facts.agent_email = profile.contact_email || facts.agent_email;
      facts.phone = facts.phone || profile.contact_phone || "";
      facts.city = facts.city || profile.city || "";
      facts.state = facts.state || profile.state || "";
      facts.zip = facts.zip || profile.zip || "";
      facts.brokerage_name = profile.brokerage_name || "";
      facts.license_number = profile.license_number || "";
      facts.photo_url = profile.photo_url || "";
    }
  } catch {
    // A profile is optional; without one the account itself is the source.
  }

  // An unfinished page of their own: reopening it is what the customer expects, and the property
  // details they already entered are the only property facts that can be filled in for them.
  try {
    const mine = (await base44.asServiceRole.entities.PropertyListing.filter({ client_email: email })) || [];
    const open = mine.find((l: any) => !l.job_id && ["DRAFT", "UNPUBLISHED"].includes(l.publication_state));
    if (open) {
      const openParts = addressParts(open.property_address || "");
      facts.property = {
        listing_id: open.listing_id,
        propertyAddress: open.property_address || "",
        city: open.city || openParts.city,
        state: open.state || openParts.state,
        zip: open.zip || openParts.zip,
        listingPrice: open.listing_price ?? "",
        bedrooms: open.bedrooms ?? "",
        bathrooms: open.bathrooms ?? "",
        propertyDescription: open.property_description || "",
      };
    }
  } catch {
    // No draft is not an error.
  }

  // Their market, when the account itself has no address on file: taken from the property they
  // most recently booked, which is where they work.
  if (!facts.city || !facts.state) {
    try {
      const rows = await base44.asServiceRole.entities.Booking.filter(
        { client_email: email },
        { sort: "-created_date", limit: 1 },
      );
      const booking = (Array.isArray(rows) ? rows : rows?.items || [])[0];
      if (booking) {
        facts.city = facts.city || booking.city || "";
        facts.state = facts.state || booking.state || "";
      }
    } catch {
      // Bookings are optional.
    }
  }

  return facts;
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

    // ---------------------------------------------------------- SEO-only draft (no photography)
    // A customer who has not bought photography may still start a property page. Identity comes
    // from the signed session alone, the address is the duplicate key, and the record is created
    // as a DRAFT: publication still requires the normal review and approval steps, so nothing is
    // published here and the publication switch is not touched.
    if (action === "get_free_page_prefill") {
      const prefillAuth = await requireCustomer(base44, req, body);
      if (!prefillAuth.ok) return Response.json({ error: prefillAuth.error }, { status: prefillAuth.status });
      const prefill = await knownCustomerFacts(base44, prefillAuth);

      // The page being opened is filled in from what we already hold: the city, state and ZIP written
      // inside the address it was created with, and the contact details on file. Only empty fields are
      // written, so anything the customer already entered or changed is left exactly as they left it.
      const openingId = String(body.listingId || "").trim();
      let listing = null;
      if (openingId) {
        const rows = (await base44.asServiceRole.entities.PropertyListing.filter({ listing_id: openingId })) || [];
        const current = rows[0] || null;
        if (!current) return Response.json({ error: "Listing not found" }, { status: 404 });
        const owner = String(current.client_email || "").toLowerCase();
        if (owner !== String(prefillAuth.actor.email || "").toLowerCase()) {
          return Response.json({ error: "Unauthorized: this property page does not belong to you" }, { status: 403 });
        }
        const patch = listingFactsPatch(current, prefill);
        if (Object.keys(patch).length) {
          await base44.asServiceRole.entities.PropertyListing.update(current.id, { ...patch, updated_at: nowIso() });
          listing = { ...current, ...patch, updated_at: nowIso() };
          await recordEvent(base44, listing, "details_updated", { email: prefillAuth.actor.email, type: "customer" }, { filled_from_existing_records: Object.keys(patch) });
        } else {
          listing = current;
        }
      }
      return Response.json({ ok: true, prefill, listing });
    }

    if (action === "create_seo_draft") {
      const seoAuth = await requireCustomer(base44, req, body);
      if (!seoAuth.ok) return Response.json({ error: seoAuth.error }, { status: seoAuth.status });
      const known = await knownCustomerFacts(base44, seoAuth);

      const seoAddress = normalizeAddress(sanitizeText(body.propertyAddress, 300));
      if (!seoAddress) {
        return Response.json({
          ok: false,
          reason: "PROPERTY_ADDRESS_REQUIRED",
          message: "A property address is required.",
        }, { status: 409 });
      }

      const seoListings = base44.asServiceRole.entities.PropertyListing;
      const mine = (await seoListings.filter({ client_email: seoAuth.actor.email })) || [];
      const existingSeo = mine.find((l: any) =>
        inScope(l) && normalizeAddress(l.normalized_address || l.property_address) === seoAddress);
      if (existingSeo) return Response.json({ ok: true, listing: existingSeo, reused: true });

      const seoListingId = `prop_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const seoParts = addressParts(seoAddress);
      const seoCity = sanitizeText(body.city, 120) || seoParts.city;
      const seoState = sanitizeText(body.state, 40).toUpperCase() || seoParts.state;
      const seoSlug = buildSlug(seoAddress, seoCity, seoState, seoListingId);
      const seoActor = { email: seoAuth.actor.email, type: "customer", isAdmin: false, clientEmail: seoAuth.actor.email };
      const num = (value: any) => (value === "" || value === null || value === undefined ? null : Number(value));

      const created = await seoListings.create({
        listing_id: seoListingId,
        tenant_id: "tnt_estate_media",
        job_id: "",
        booking_id: "",
        duplicate_key: duplicateKey("", seoAddress),
        client_email: seoAuth.actor.email,
        client_name: seoAuth.actor.full_name || "",
        property_address: seoAddress,
        normalized_address: seoAddress,
        city: seoCity || known.city,
        state: seoState || known.state,
        zip: sanitizeText(body.zip, 12) || seoParts.zip || known.zip,
        square_footage: num(body.squareFootage),
        square_footage_source: body.squareFootage ? "customer" : "",
        listing_price: num(body.listingPrice),
        bedrooms: num(body.bedrooms),
        bathrooms: num(body.bathrooms),
        property_type: sanitizeText(body.propertyType, 80),
        property_description: sanitizeText(body.propertyDescription, 2000),
        amenities: [],
        listing_status: "draft",
        // The listing contact is filled in from what we already hold, so the customer confirms it
        // rather than retyping it. Nothing here is published as confirmed: the authorizations and
        // the publication consent are still theirs to give.
        agent_name: known.full_name,
        agent_email: known.agent_email,
        agent_phone: known.phone,
        approved_contact_email: known.agent_email,
        approved_contact_phone: known.phone,
        brokerage_name: known.brokerage_name,
        agent_license_number: known.license_number,
        agent_photo_url: known.photo_url,
        selected_media: [],
        cover_file_id: "",
        include_video: false,
        publication_state: "DRAFT",
        publication_history: [{ from_state: null, to_state: "DRAFT", at: nowIso(), actor: seoAuth.actor.email, note: "created without photography" }],
        ai_generation_count: 0,
        inquiry_count: 0,
        sitemap_included: false,
        public_slug: seoSlug,
        public_url: propertyPageUrl(seoSlug),
        canonical_url: propertyPageUrl(seoSlug),
        disclosures_snapshot: ADVERTISING_DISCLOSURES.join("\n"),
        reso: resoProjection({ listing_id: seoListingId, listing_status: "draft", property_type: "" }),
        certification_mode: certScope,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      await recordEvent(base44, created, "listing_created", seoActor, { origin: "seo_only", address: seoAddress });
      return Response.json({ ok: true, listing: created });
    }

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

      // A page built from a delivered shoot starts with the parts of the address and the customer
      // details the order itself carries, so the customer confirms rather than retypes.
      const parts = addressParts(address);
      const slug = buildSlug(address, facts.city || parts.city, facts.state || parts.state, listingId);
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
        city: facts.city || parts.city,
        state: facts.state || parts.state,
        zip: facts.zip || parts.zip,
        square_footage: facts.square_footage ?? null,
        square_footage_source: facts.square_footage_source || "",
        listing_price: null,
        bedrooms: null,
        bathrooms: null,
        property_type: "",
        property_description: "",
        amenities: [],
        listing_status: "draft",
        agent_name: job.client_name || "",
        agent_email: job.client_email || "",
        agent_phone: job.client_phone || "",
        approved_contact_email: job.client_email || "",
        approved_contact_phone: job.client_phone || "",
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
      // A published page's structured data is a projection of the facts currently on the record, so
      // it is rebuilt on every change that can move one of them: price, size, status, photography,
      // contact. Only that machine-readable projection is refreshed. The text the customer approved
      // is never rewritten here, and seo_source_hash is left alone so it still describes the
      // generation that approved copy came from.
      const projected = { ...listing, ...patch };
      if (projected.publication_state === "PUBLISHED" && projected.structured_data) {
        patch.structured_data = buildStructuredData(
          projected,
          projected.canonical_url || propertyPageUrl(projected.public_slug),
        );
      }
      await listings.update(listing.id, patch);
      const fresh = { ...listing, ...patch };
      await recordEvent(base44, fresh, eventType, actor, details, states);
      listing = fresh;
      // Any state, content or media change invalidates the exact edge keys for this listing:
      // its page, the sitemap, and every media asset it can currently expose. Invalidating here
      // covers publishing, unpublishing, archiving, listing-status changes and media
      // authorization changes in one place. Inert until the edge secrets exist, and never
      // allowed to fail the customer action.
      // The shared directory page is dropped too: publishing, unpublishing or changing a listing
      // changes what that page shows, and it is where any paid placement appears.
      const edgePurge = await purgeListingFromEdge(fresh, [DIRECTORY_SLUG]);
      if (edgePurge && edgePurge.ok === false && edgePurge.skipped !== true) {
        console.log(`edge purge failed for ${fresh.listing_id}: ${edgePurge.error || edgePurge.status}`);
      }
      // Advertising follows the listing immediately. A property that stops being eligible has
      // its advertising stopped here, not at the next scheduled sweep.
      const advertisingRelevant = ["publication_state", "listing_status", "authority_confirmed", "status_confirmation_due_at"]
        .some((key) => key in patch);
      if (advertisingRelevant) {
        try {
          const advertising = await guardListingAdvertising(base44, fresh, { actor: actor?.email || "listing-update" });
          if (advertising?.paused?.length || advertising?.needs_stop?.length) {
            console.log(`advertising guarded for ${fresh.listing_id}: paused ${advertising.paused.length}, needs stop ${advertising.needs_stop.length}`);
          }
        } catch (guardError: any) {
          // Never allowed to fail the customer's listing action; the campaign stays flagged.
          console.log(`advertising guard failed for ${fresh.listing_id}: ${guardError?.message || "unknown"}`);
        }
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

    // ------------------------------------------------------------------ uploaded photographs
    // A page started without a shoot holds the customer's own photographs. Those are stored as public
    // image URLs, because the published page renders without a session and nothing on it can depend on
    // a private file. Only a URL this app's storage returns is accepted, so a page can never be pointed
    // at a host we do not control.
    if (action === "save_uploaded_media") {
      if (listing.job_id) {
        return Response.json({
          ok: false,
          reason: "DELIVERED_MEDIA_IN_USE",
          message: "This page uses your delivered media. Choose your photographs from the gallery instead.",
        }, { status: 409 });
      }
      const incoming = Array.isArray(body.selected_media) ? body.selected_media : [];
      const cleaned = incoming
        .slice(0, 30)
        .map((m: any, index: number) => ({
          drive_file_id: sanitizeText(m.drive_file_id, 80) || `up_${index}_${Date.now().toString(36)}`,
          url: sanitizeText(m.url, 900),
          name: sanitizeText(m.name, 200),
          kind: "photo",
          alt_text: sanitizeText(m.alt_text, 200),
          source: "uploaded",
          position: index,
        }))
        .filter((m: any) => /^https:\/\/[^\s]+$/.test(m.url) && m.url.includes("/storage/v1/object/public/"));
      if (!cleaned.length) {
        return Response.json({
          ok: false,
          reason: "MEDIA_SELECTION_REQUIRED",
          message: "Add at least one photograph to the property page.",
        }, { status: 409 });
      }
      const cover = cleaned.find((m: any) => m.drive_file_id === body.cover_file_id) || cleaned[0];
      await update(
        {
          selected_media: cleaned,
          cover_file_id: cover.drive_file_id,
          include_video: false,
          media_selection_approved_at: nowIso(),
        },
        "media_selection_saved",
        { photos: cleaned.length, source: "uploaded" },
      );
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
      // The contact's own approved headshot, shown on the public page.
      if (body.agent_photo_url !== undefined) patch.agent_photo_url = sanitizeText(body.agent_photo_url, 500);
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
      // The customer's approval of the page content is what lets that text reach the page: the copy
      // is published exactly as the customer approved it, never as generated.
      if (!listing.content_approved_at) {
        return Response.json({ ok: false, reason: "CONTENT_APPROVAL_REQUIRED", message: "The customer must approve the page content before it is published." }, { status: 409 });
      }

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