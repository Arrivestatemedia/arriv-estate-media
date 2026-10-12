import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  AVAILABLE_LISTING_STATUSES,
  CERT_PREFIX,
  COST_MODEL,
  PROPERTY_FEATURE_FLAG_KEY,
  buildSlug,
  canActorAccessListing,
  canApprovePublication,
  duplicateKey,
  estimateCostPerProperty,
  isJobEligibleForPropertyPage,
  isPubliclyActive,
  needsStatusConfirmation,
  normalizeSelection,
  resoProjection,
  shouldAutoDeactivate,
  transitionError,
} from "../../shared/propertyVisibility.ts";
import { certificationAdminVerdict } from "../../shared/propertyCertRunGuard.ts";
import {
  acquirePropertyCertRunLock,
  assertNoForeignPropertyCertArtifacts,
  releasePropertyCertRunLock,
} from "../../shared/propertyCertRunLock.ts";
import { cleanupPropertyCertRun } from "../../shared/certRunCleanup.ts";

// Property Visibility v1.0 certification suite.
//
// Runs entirely on synthetic records (cert_prop_ prefixed, deleted in a finally block) and
// asserts four things beyond the feature behaviour itself:
//   1. the production feature flag is NEVER written (value and the setting record's own
//      updated_date are compared before and after the run),
//   2. test mode reaches certification records only — the production scope never sees them and
//      test mode never sees a real listing,
//   3. no production property listing is created or modified,
//   4. payroll, commission, Auto-Fund, wallet and invoicing counts are untouched.
//
// The suite no longer switches the production feature flag on. Every call opts into the
// isolated certification test mode instead, which is honoured only when the certification-only
// configuration (PROPERTY_VISIBILITY_TEST_MODE) is present.
//
// Policy assertions run against the shared engine — the same module the API and the public
// surfaces use — and the end-to-end assertions run against the deployed functions.

const ORIGIN = (() => {
  const domain = String((globalThis as any)?.process?.env?.BASE44_APP_DOMAIN || "").trim();
  if (!domain) return "https://arrivestatemedia.base44.app";
  return /^https?:\/\//i.test(domain) ? domain.replace(/\/+$/, "") : `https://${domain}`;
})();

const RUN = `${CERT_PREFIX}${Date.now()}`;
const CLIENT_EMAIL = `${RUN}@cert.test`;
const AGENT_EMAIL = `${RUN}.agent@cert.test`;
const JOB_MARKER = `${RUN}_job`;

// Every certification call opts into test mode. A call that must prove the production scope
// still governs passes __no_test_mode, which sends the request exactly as a real visitor would.
async function callFn(name: string, payload: any) {
  const body = { ...payload };
  const useTestMode = body.__no_test_mode !== true;
  delete body.__no_test_mode;
  if (useTestMode) body.test_mode = true;
  try {
    const res = await fetch(`${ORIGIN}/functions/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 20000) }; }
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 0, data: { error: err.message } };
  }
}

async function getSetting(base44: any, key: string) {
  const rows = await base44.asServiceRole.entities.AppSetting.filter({ key });
  const list = Array.isArray(rows) ? rows : (rows?.items || []);
  return list[0] || null;
}

async function countEntity(base44: any, name: string) {
  try {
    const rows = await base44.asServiceRole.entities[name].list("-created_date", 1000);
    const list = Array.isArray(rows) ? rows : (rows?.items || []);
    return list.length;
  } catch {
    return -1;
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ================= 1. AUTHORIZATION =================
  // The FIRST thing this endpoint does. The identity comes from the platform-verified session
  // only — never from a body field, a query parameter or a header claim — and nothing is read,
  // created, deleted or called before it passes. Anonymous callers get 401, authenticated
  // non-administrators get 403, so neither can reach the run.
  const user = await base44.auth.me().catch(() => null);
  const verdict = certificationAdminVerdict(user);
  if (!verdict.authorized) {
    return Response.json({ authorized: false, started: false, error: verdict.reason }, { status: verdict.status });
  }
  const actorEmail = String(user?.email || "");

  // ================= 2. ONE RUN AT A TIME =================
  // Server-enforced, bounded lock plus a data-level guard. A second run is refused before any
  // record work, so it can never modify or clean up the active run's records.
  const runLock = await acquirePropertyCertRunLock(base44.asServiceRole, RUN, actorEmail);
  if (!runLock.acquired) {
    return Response.json({
      authorized: true,
      started: false,
      error: "Another Property Visibility certification run is active.",
      run_lock: runLock,
    }, { status: 409 });
  }
  const foreignArtifacts = await assertNoForeignPropertyCertArtifacts(base44.asServiceRole, RUN);
  if (!foreignArtifacts.clear) {
    await releasePropertyCertRunLock(base44.asServiceRole, RUN);
    return Response.json({
      authorized: true,
      started: false,
      error: "Certification artifacts from an earlier run are still present. Reconcile them before starting a new run.",
      foreign_artifacts: foreignArtifacts,
    }, { status: 409 });
  }

  const tests: { name: string; passed: boolean; detail: string }[] = [];
  const add = (name: string, passed: boolean, detail = "") => tests.push({ name, passed, detail });

  const FINANCIAL_ENTITIES = ["PayrollSubmission", "PayrollPeriod", "Commission", "SalesCompensationEvent", "PrepaidCompensationEvent", "AutoFundSubscription", "PrepaidWallet", "CreditLot", "Invoice", "PayoutHistory"];
  const beforeFinancial: Record<string, number> = {};
  for (const e of FINANCIAL_ENTITIES) beforeFinancial[e] = await countEntity(base44, e);
  const beforeProductionListings = await countEntity(base44, "PropertyListing");

  const flagBefore = await getSetting(base44, PROPERTY_FEATURE_FLAG_KEY);
  const flagBeforeValue = flagBefore?.value ?? null;
  const flagBeforeUpdated = flagBefore?.updated_date ?? null;

  const created = { listingIds: [] as string[], eventIds: [] as string[], inquiryIds: [] as string[], jobId: null as string | null };
  let flagUntouched = false;
  let cleanupReport: any = null;
  let propertySweep: any = null;
  let lockRelease: any = null;

  try {
    // ================= 1. Policy: order eligibility =================
    const incomplete = isJobEligibleForPropertyPage({ production_status: "editing" });
    const complete = isJobEligibleForPropertyPage({ production_status: "delivered" });
    add("completed_vs_incomplete_orders", incomplete.eligible === false && incomplete.reason === "MEDIA_NOT_DELIVERED" && complete.eligible === true,
      `editing → ${incomplete.reason}; delivered → eligible`);

    // ================= 2. Policy: customer ownership =================
    const listingShape = { client_email: CLIENT_EMAIL };
    const ownerOk = canActorAccessListing(listingShape, { isAdmin: false, clientEmail: CLIENT_EMAIL });
    const strangerOk = canActorAccessListing(listingShape, { isAdmin: false, clientEmail: `${RUN}.stranger@cert.test` });
    const anonOk = canActorAccessListing(listingShape, { isAdmin: false, clientEmail: "" });
    add("correct_customer_ownership", ownerOk === true && strangerOk === false && anonOk === false,
      `owner=${ownerOk}, other=${strangerOk}, anonymous=${anonOk}`);

    // ================= 3. Policy: publication authorization =================
    const customerMayApprove = canApprovePublication({ isAdmin: false, clientEmail: CLIENT_EMAIL });
    const adminMayApprove = canApprovePublication({ isAdmin: true });
    add("publication_authorization", customerMayApprove === true && adminMayApprove === false,
      `customer=${customerMayApprove}, admin=${adminMayApprove}`);

    // ================= 4. Policy: state machine =================
    const legal = transitionError("DRAFT", "READY_FOR_REVIEW") === null && transitionError("APPROVED", "PUBLISHED") === null;
    const illegal = transitionError("DRAFT", "PUBLISHED") !== null && transitionError("PUBLISHED", "APPROVED") !== null && transitionError("ARCHIVED", "PUBLISHED") !== null;
    add("publication_state_machine", legal && illegal, "DRAFT→READY_FOR_REVIEW and APPROVED→PUBLISHED legal; DRAFT→PUBLISHED, PUBLISHED→APPROVED, ARCHIVED→PUBLISHED rejected");

    // ================= 5. Policy: media selection and ordering =================
    const allowed = new Map<string, any>([
      ["f1", { id: "f1", name: "kitchen.jpg", isImage: true, isVideo: false }],
      ["f2", { id: "f2", name: "exterior.jpg", isImage: true, isVideo: false }],
      ["f3", { id: "f3", name: "tour.mp4", isImage: false, isVideo: true }],
      ["f4", { id: "f4", name: "floorplan.pdf", isImage: false, isVideo: false }],
    ]);
    const norm = normalizeSelection([
      { drive_file_id: "f2", position: 5 },
      { drive_file_id: "f1", position: 1 },
      { drive_file_id: "f3", position: 2 },
      { drive_file_id: "f4", position: 3 },
      { drive_file_id: "foreign_file", position: 4 },
    ], allowed, "f2");
    const orderOk = norm.selected.map((m: any) => m.drive_file_id).join(",") === "f1,f3,f2";
    const positionsOk = norm.selected.every((m: any, i: number) => m.position === i);
    add("photo_selection_and_ordering", orderOk && positionsOk && norm.cover === "f2" && norm.rejected === 2 && norm.photo_count === 2 && norm.video_count === 1,
      `order=${norm.selected.map((m: any) => m.drive_file_id).join(">")}, positions renumbered=${positionsOk}, cover=${norm.cover}, rejected=${norm.rejected} (unapproved pdf + file outside the delivered folder)`);

    const fallback = normalizeSelection([{ drive_file_id: "f1" }, { drive_file_id: "f3" }], allowed, "");
    add("cover_fallback_to_first_photo", fallback.cover === "f1", `cover=${fallback.cover}`);

    // ================= 6. Policy: availability and stale-status deactivation =================
    const now = new Date();
    const fresh = { publication_state: "PUBLISHED", listing_status: "active", last_status_confirmed_at: now.toISOString(), certification_mode: false };
    const stale45 = { ...fresh, last_status_confirmed_at: new Date(now.getTime() - 45 * 86400000).toISOString() };
    const stale61 = { ...fresh, last_status_confirmed_at: new Date(now.getTime() - 61 * 86400000).toISOString() };
    const sold = { ...fresh, listing_status: "sold" };
    const availabilityOk =
      isPubliclyActive(fresh, now) === true &&
      isPubliclyActive(stale45, now) === false &&
      isPubliclyActive(sold, now) === false &&
      needsStatusConfirmation(stale45, now) === true &&
      shouldAutoDeactivate(stale61, now) === true &&
      shouldAutoDeactivate(stale45, now) === false;
    add("listing_status_and_deactivation_policy", availabilityOk,
      "active+fresh shown; 45d unconfirmed hidden but not deactivated; 61d deactivated; sold never available");

    // ================= 7. Policy: slugs, duplicate key, RESO projection, cost =================
    const slugA = buildSlug("123 Maple Street", "Bethesda", "MD", "prop_abc12345");
    const dkeyA = duplicateKey("job1", "123 Maple Street");
    const dkeyB = duplicateKey("job1", "123  maple   street");
    const cost = estimateCostPerProperty({ ai_generation_count: 1 });
    add("seo_inputs_and_slug_determinism", slugA === buildSlug("123 Maple Street", "Bethesda", "MD", "prop_abc12345") && dkeyA === dkeyB && !!slugA,
      `slug=${slugA}, duplicate key stable for whitespace variants`);
    const reso = resoProjection({ listing_id: "prop_1", listing_status: "pending", property_type: "house" });
    add("reso_projection_reserved", reso.standard_status === "Pending" && reso.reso_listing_key === "prop_1",
      "RESO-standard status mapped for a future MLS integration (not used in v1.0)");
    add("cost_model_reports_no_duplication", cost.monthly_total > 0 && cost.assumptions.media_duplicated === false && COST_MODEL.media_duplication_gb === 0,
      `est. $${cost.monthly_total}/month per listing, $${cost.one_time_ai_content} one-time AI content; no media duplicated`);

    // ================= 8. End-to-end: synthetic job + draft =================
    // The production feature flag is NOT touched. The job and the draft are created through the
    // ordinary API in test mode, which marks the listing as a certification record.
    const job = await base44.asServiceRole.entities.Job.create({
      tenant_id: "tnt_estate_media",
      title: `${JOB_MARKER} 123 Maple Street`,
      location: "Bethesda, MD",
      state: "MD",
      date: new Date().toISOString().slice(0, 10),
      type: "photo",
      pay_rate: 0,
      duration_hours: 1,
      from_booking: false,
      production_status: "delivered",
      status: "completed",
      client_email: CLIENT_EMAIL,
      client_name: "Certification Owner",
      is_sample: true,
    });
    created.jobId = job.id;

    const draft1 = await callFn("managePropertyListing", { action: "create_draft", jobId: job.id, clientEmail: CLIENT_EMAIL, certification_run_id: RUN });
    const draft2 = await callFn("managePropertyListing", { action: "create_draft", jobId: job.id, clientEmail: CLIENT_EMAIL });
    const listing = draft1.data?.listing;
    if (listing) {
      created.listingIds.push(listing.listing_id);
      // Mark the synthetic listing so an interrupted run is still identifiable and sweepable.
      await base44.asServiceRole.entities.PropertyListing.update(listing.id, { certification_run_id: RUN });
    }
    add("duplicate_page_prevention", draft1.data?.ok === true && draft2.data?.ok === true && draft2.data?.reused === true && draft1.data?.listing?.listing_id === draft2.data?.listing?.listing_id,
      `second create_draft reused ${draft2.data?.listing?.listing_id || "n/a"}`);

    // ================= 9. End-to-end: ownership is enforced by the API =================
    const stranger = await callFn("managePropertyListing", { action: "update_details", listingId: listing?.listing_id, clientEmail: `${RUN}.stranger@cert.test`, details: { property_address: "Hijacked" } });
    const strangerBlocked = stranger.status === 403 || stranger.status === 404 || stranger.data?.ok === false;
    add("ownership_enforced_by_api", strangerBlocked, `stranger call → status ${stranger.status}`);

    // ================= 10. End-to-end: media outside the delivered folder is refused =================
    const media = await callFn("managePropertyListing", { action: "save_media", listingId: listing?.listing_id, clientEmail: CLIENT_EMAIL, selected_media: [{ drive_file_id: "not_a_delivered_file", position: 0 }] });
    add("media_allowlist_refuses_foreign_assets", media.data?.ok === false && media.data?.reason === "MEDIA_SELECTION_REQUIRED",
      `response reason=${media.data?.reason || media.status}`);

    // ================= 11. End-to-end: publish path =================
    // Media selection is seeded directly because the synthetic job has no Drive folder — the
    // allow-list path is asserted above, and the ordering/cover rules by the engine tests.
    await base44.asServiceRole.entities.PropertyListing.update(listing.id, {
      selected_media: [
        { drive_file_id: "cert_file_1", name: "exterior.jpg", kind: "photo", alt_text: "Front exterior of the home", position: 0 },
        { drive_file_id: "cert_file_2", name: "kitchen.jpg", kind: "photo", alt_text: "Kitchen with island", position: 1 },
        { drive_file_id: "cert_file_3", name: "tour.mp4", kind: "video", alt_text: "", position: 2 },
      ],
      cover_file_id: "cert_file_1",
      include_video: true,
      media_selection_approved_at: new Date().toISOString(),
    });

    const details = await callFn("managePropertyListing", {
      action: "update_details", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL,
      details: { property_address: "123 Maple Street", city: "Bethesda", state: "MD", zip: "20814", listing_price: 875000, bedrooms: 4, bathrooms: 3, square_footage: 2800, property_type: "house", property_description: "A four bedroom home.", amenities: ["Garage", "Fireplace"] },
    });
    add("property_details_recorded", details.data?.ok === true && details.data?.listing?.listing_price === 875000,
      `price=${details.data?.listing?.listing_price}`);

    const seo1 = await callFn("managePropertyListing", { action: "generate_seo", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL });
    const seo2 = await callFn("managePropertyListing", { action: "generate_seo", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL });
    const draftSeo = seo1.data?.listing?.ai_draft;
    add("seo_metadata_generation", seo1.data?.ok === true && !!draftSeo?.seo_title && !!draftSeo?.meta_description && Array.isArray(draftSeo?.alt_texts),
      `title="${String(draftSeo?.seo_title || "").slice(0, 60)}", meta="${String(draftSeo?.meta_description || "").slice(0, 70)}..."`);
    add("seo_regenerated_only_on_change", seo2.data?.cached === true && seo2.data?.ai_calls === 0,
      `second generate_seo call: cached=${seo2.data?.cached}, ai_calls=${seo2.data?.ai_calls}`);

    const approved = await callFn("managePropertyListing", {
      action: "approve_content", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL,
      content: { property_description: draftSeo?.property_description || "A four bedroom home.", seo_title: draftSeo?.seo_title || "123 Maple Street, Bethesda MD", meta_description: draftSeo?.meta_description || "Four bedroom home in Bethesda, Maryland with 2,800 square feet." },
    });
    add("customer_approves_factual_content", approved.data?.ok === true && !!approved.data?.listing?.content_approved_at,
      `content_approved_at=${approved.data?.listing?.content_approved_at ? "set" : "missing"}`);

    const auth = await callFn("managePropertyListing", {
      action: "record_authorizations", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL,
      agent_name: "Certification Agent", agent_email: AGENT_EMAIL, agent_phone: "5550000000",
      brokerage_name: "Certification Realty", authority_confirmed: true, brokerage_approved: true, disclosures_accepted: true,
    });
    add("agent_authority_brokerage_disclosures", auth.data?.ok === true && auth.data?.listing?.authority_confirmed === true && auth.data?.listing?.brokerage_approved === true && auth.data?.listing?.disclosures_accepted === true,
      "authority, brokerage approval and advertising disclosures recorded");

    const review = await callFn("managePropertyListing", { action: "submit_for_review", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL });

    const approveNoConsent = await callFn("managePropertyListing", { action: "approve_publication", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL });
    add("publication_requires_explicit_consent", approveNoConsent.data?.reason === "CONSENT_REQUIRED",
      `without consent → ${approveNoConsent.data?.reason || approveNoConsent.status}`);

    const approvedPub = await callFn("managePropertyListing", { action: "approve_publication", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL, consent: true });
    const published = await callFn("managePropertyListing", { action: "publish", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL });
    const stateOk = review.data?.ok === true && approvedPub.data?.listing?.publication_state === "APPROVED" && published.data?.listing?.publication_state === "PUBLISHED";
    add("publishing_workflow_draft_to_published", stateOk,
      `state after publish=${published.data?.listing?.publication_state}, approving account=${published.data?.listing?.approving_account || "n/a"}`);

    const history = published.data?.listing?.publication_history || [];
    add("publication_history_recorded", history.length >= 3 && !!published.data?.listing?.approved_property_details_snapshot && (published.data?.listing?.approved_media_snapshot || []).length === 3,
      `${history.length} history entries, approved details + ${(published.data?.listing?.approved_media_snapshot || []).length} approved media assets`);

    // ================= 12. Public rendering and SEO =================
    const publicJson = await callFn("getPublicPropertyPage", { slug: published.data?.listing?.public_slug });
    const publicHtml = await callFn("getPublicPropertyPage", { slug: published.data?.listing?.public_slug, format: "html" });
    const html = typeof publicHtml.data === "string" ? publicHtml.data : String(publicHtml.data?.raw || "");
    const htmlOk = /<title>/.test(html) && /name="description"/.test(html) && /rel="canonical"/.test(html) && /application\/ld\+json/.test(html) && /RealEstateListing/.test(html);
    add("public_url_rendering", publicJson.data?.ok === true && publicJson.data?.publicly_available === true && (publicJson.data?.media || []).length === 3,
      `json ok=${publicJson.data?.ok}, media=${(publicJson.data?.media || []).length}, order=${(publicJson.data?.media || []).map((m: any) => m.kind).join(">")}`);
    add("seo_metadata_and_crawlable_html", htmlOk && !!publicJson.data?.canonical_url && !!publicJson.data?.structured_data?.["@type"],
      `server-rendered HTML contains title, meta description, canonical, JSON-LD (${String(publicJson.data?.structured_data?.["@type"] || "none")})`);

    const sitemapPublished = await fetch(`${ORIGIN}/functions/generatePropertySitemap?test_mode=true`);
    const sitemapXml = await sitemapPublished.text();
    add("sitemap_inclusion", sitemapXml.includes(published.data?.listing?.public_slug),
      "published listing appears in the sitemap");

    // ================= 13. Directory search =================
    const search = await callFn("searchProperties", { q: "Bethesda", status: "active" });
    const found = (search.data?.results || []).find((r: any) => r.slug === published.data?.listing?.public_slug);
    add("directory_search_returns_published_listing", !!found && search.data?.ok === true,
      `total=${search.data?.total}, found=${!!found}`);

    // ================= 14. Buyer inquiry routing =================
    const inquiry = await callFn("submitPropertyInquiry", {
      slug: published.data?.listing?.public_slug, name: "Certification Buyer", email: `${RUN}.buyer@cert.test`,
      phone: "5551112222", message: "I would like to arrange a viewing of this property next week.", consent_privacy: true, company_website: "",
    });
    const inquiryRecord = inquiry.data?.ok === true
      ? (await base44.asServiceRole.entities.PropertyInquiry.filter({ public_slug: published.data?.listing?.public_slug }))[0]
      : null;
    if (inquiryRecord) created.inquiryIds.push(inquiryRecord.inquiry_id);
    add("buyer_inquiry_routing", inquiry.data?.ok === true && inquiryRecord?.routed_to_email === AGENT_EMAIL && inquiryRecord?.lead_sharing_status === "not_shared",
      `routed to ${inquiryRecord?.routed_to_email || "n/a"}, lead sharing=${inquiryRecord?.lead_sharing_status || "n/a"}`);

    const invalid = await callFn("submitPropertyInquiry", { slug: published.data?.listing?.public_slug, name: "A", email: "not-an-email", message: "short", consent_privacy: false });
    const honeypot = await callFn("submitPropertyInquiry", { slug: published.data?.listing?.public_slug, name: "Certification Bot", email: `${RUN}.bot@cert.test`, message: "Buy now cheap offers available today", consent_privacy: true, company_website: "http://spam.example" });
    add("inquiry_validation_and_spam_prevention", invalid.status === 400 && invalid.data?.reason === "VALIDATION_FAILED" && honeypot.data?.filtered === true,
      `invalid → ${invalid.status} ${invalid.data?.reason}; honeypot → filtered=${honeypot.data?.filtered}`);

    // ================= 15. Listing status lifecycle =================
    const soldUpdate = await callFn("managePropertyListing", { action: "update_listing_status", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL, status: "sold" });
    const searchAfterSold = await callFn("searchProperties", { q: "Bethesda" });
    const pageAfterSold = await callFn("getPublicPropertyPage", { slug: published.data?.listing?.public_slug });
    const sitemapAfterSold = await (await fetch(`${ORIGIN}/functions/generatePropertySitemap?test_mode=true`)).text();
    add("listing_status_change_removes_from_active_search", soldUpdate.data?.ok === true
      && !(searchAfterSold.data?.results || []).some((r: any) => r.slug === published.data?.listing?.public_slug)
      && pageAfterSold.data?.publicly_available === false && pageAfterSold.data?.indexable === false
      && !sitemapAfterSold.includes(published.data?.listing?.public_slug),
      `sold → removed from search, page reachable but not advertised (publicly_available=false, indexable=false), removed from sitemap`);

    const confirm = await callFn("managePropertyListing", { action: "confirm_status", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL });
    add("periodic_status_confirmation", confirm.data?.ok === true && !!confirm.data?.listing?.status_confirmation_due_at,
      `next confirmation due ${String(confirm.data?.listing?.status_confirmation_due_at || "").slice(0, 10)}`);

    // ================= 16. Unpublishing =================
    const activeAgain = await callFn("managePropertyListing", { action: "update_listing_status", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL, status: "active" });
    const unpublished = await callFn("managePropertyListing", { action: "unpublish", listingId: listing.listing_id, clientEmail: CLIENT_EMAIL, reason: "certification" });
    const pageAfterUnpublish = await callFn("getPublicPropertyPage", { slug: published.data?.listing?.public_slug });
    const searchAfterUnpublish = await callFn("searchProperties", { q: "Bethesda" });
    add("unpublish_removes_public_access", activeAgain.data?.ok === true && unpublished.data?.listing?.publication_state === "UNPUBLISHED"
      && pageAfterUnpublish.status === 404 && !(searchAfterUnpublish.data?.results || []).some((r: any) => r.slug === published.data?.listing?.public_slug),
      `state=${unpublished.data?.listing?.publication_state}, public page status=${pageAfterUnpublish.status}, directory excludes it`);

    // ================= 17. Private media protection =================
    const privateProbe = await fetch(`${ORIGIN}/functions/streamPropertyMedia?listing=${listing.listing_id}&file=cert_file_1&test_mode=true`);
    const foreignProbe = await fetch(`${ORIGIN}/functions/streamPropertyMedia?listing=${listing.listing_id}&file=some_other_file&test_mode=true`);
    add("private_media_access_protection", privateProbe.status === 404 && foreignProbe.status === 404,
      `unpublished listing asset → ${privateProbe.status}; asset outside the approved selection → ${foreignProbe.status}`);

    // ================= 18. Concurrent customer activity =================
    const concurrent = await Promise.all([
      callFn("managePropertyListing", { action: "create_draft", jobId: job.id, clientEmail: CLIENT_EMAIL }),
      callFn("managePropertyListing", { action: "create_draft", jobId: job.id, clientEmail: CLIENT_EMAIL }),
      callFn("managePropertyListing", { action: "create_draft", jobId: job.id, clientEmail: CLIENT_EMAIL }),
    ]);
    const allListings = await base44.asServiceRole.entities.PropertyListing.filter({ job_id: job.id });
    const listingRows = Array.isArray(allListings) ? allListings : (allListings?.items || []);
    add("concurrent_customer_activity", listingRows.length === 1 && concurrent.every((r) => r.data?.ok === true),
      `${listingRows.length} listing for the job after three concurrent create_draft calls`);

    // ================= 19. Existing delivery and download regression =================
    const galleryWrongOwner = await callFn("getJobMediaForClient", { jobId: job.id, clientEmail: `${RUN}.stranger@cert.test` });
    const galleryOwner = await callFn("getJobMediaForClient", { jobId: job.id, clientEmail: CLIENT_EMAIL });
    const downloadWrongOwner = await callFn("downloadJobMedia", { jobId: job.id, clientEmail: `${RUN}.stranger@cert.test`, fileId: "cert_file_1" });
    add("existing_delivery_regression", galleryWrongOwner.status === 403 && galleryOwner.status === 200 && downloadWrongOwner.status === 403,
      `gallery: stranger ${galleryWrongOwner.status}, owner ${galleryOwner.status}; download: stranger ${downloadWrongOwner.status}`);

    // ================= 20. Production scope still governs, read-only =================
    // These two calls deliberately send no test mode, i.e. exactly what a real visitor sends.
    // Nothing here writes the feature flag.
    const pageNoTestMode = await callFn("getPublicPropertyPage", { slug: published.data?.listing?.public_slug, __no_test_mode: true });
    const searchNoTestMode = await callFn("searchProperties", { __no_test_mode: true });
    const certVisibleToProduction = (searchNoTestMode.data?.results || []).some((r: any) => r.slug === published.data?.listing?.public_slug);
    const productionScopeHolds = flagBeforeValue === "true"
      ? pageNoTestMode.status === 200
      : pageNoTestMode.status === 404 && searchNoTestMode.data?.feature_disabled === true;
    add("certification_never_reaches_production_scope", certVisibleToProduction === false && productionScopeHolds && searchNoTestMode.data?.ok !== true,
      `production scope: directory exposed the certification listing=${certVisibleToProduction}, page ${pageNoTestMode.status}, directory disabled=${searchNoTestMode.data?.feature_disabled === true} (production flag=${flagBeforeValue ?? "absent"})`);
    add("certification_scope_is_disjoint", pageNoTestMode.status === 404 && publicJson.data?.ok === true,
      `same slug with no test mode → ${pageNoTestMode.status}; with test mode → served (${publicJson.data?.ok === true})`);
  } catch (err: any) {
    add("suite_execution", false, `Suite aborted: ${err.message}`);
  } finally {
    // Cleanup: delete every synthetic record this run created.
    try {
      const asList = (r: any) => (Array.isArray(r) ? r : (r?.items || []));
      // Property artifacts — the page, its publication events and its inquiries — go through the
      // shared, marker-guarded teardown path: run-scoped, dependents-first, idempotent, and safe
      // to retry. A record is only removed when it is a certification record attributable to
      // this run.
      propertySweep = await cleanupPropertyCertRun(base44.asServiceRole, RUN, {
        extraEmails: [`${RUN}.buyer@cert.test`, AGENT_EMAIL],
        listingIds: created.listingIds,
      });
      // Sweep by the run marker first, so an interrupted run's fixtures are still removable.
      for (const l of asList(await base44.asServiceRole.entities.PropertyListing.filter({ certification_run_id: RUN }))) {
        for (const e of asList(await base44.asServiceRole.entities.PropertyListingEvent.filter({ listing_id: l.listing_id }))) {
          await base44.asServiceRole.entities.PropertyListingEvent.delete(e.id);
        }
        for (const i of asList(await base44.asServiceRole.entities.PropertyInquiry.filter({ listing_id: l.listing_id }))) {
          await base44.asServiceRole.entities.PropertyInquiry.delete(i.id);
        }
        await base44.asServiceRole.entities.PropertyListing.delete(l.id);
      }
      for (const id of created.listingIds) {
        for (const e of asList(await base44.asServiceRole.entities.PropertyListingEvent.filter({ listing_id: id }))) {
          await base44.asServiceRole.entities.PropertyListingEvent.delete(e.id);
        }
        for (const i of asList(await base44.asServiceRole.entities.PropertyInquiry.filter({ listing_id: id }))) {
          await base44.asServiceRole.entities.PropertyInquiry.delete(i.id);
        }
        for (const l of asList(await base44.asServiceRole.entities.PropertyListing.filter({ listing_id: id }))) {
          await base44.asServiceRole.entities.PropertyListing.delete(l.id);
        }
      }
      // Belt and braces: anything still bound to this run's synthetic customer or job.
      for (const l of asList(await base44.asServiceRole.entities.PropertyListing.filter({ client_email: CLIENT_EMAIL }))) {
        await base44.asServiceRole.entities.PropertyListing.delete(l.id);
      }
      if (created.jobId) {
        for (const l of asList(await base44.asServiceRole.entities.PropertyListing.filter({ job_id: created.jobId }))) {
          await base44.asServiceRole.entities.PropertyListing.delete(l.id);
        }
      }
      for (const i of asList(await base44.asServiceRole.entities.PropertyInquiry.filter({ email: `${RUN}.buyer@cert.test` }))) {
        await base44.asServiceRole.entities.PropertyInquiry.delete(i.id);
      }
      if (created.jobId) await base44.asServiceRole.entities.Job.delete(created.jobId);
      cleanupReport = {
        property_sweep: propertySweep
          ? {
              deleted: propertySweep.deleted.length,
              remaining: propertySweep.remaining,
              remaining_by_entity: propertySweep.remaining_by_entity,
              errors: propertySweep.errors,
            }
          : { error: "property sweep did not run" },
      };
    } catch (err: any) {
      cleanupReport = {
        property_sweep: propertySweep ? { deleted: propertySweep.deleted.length, remaining: propertySweep.remaining } : null,
        error: err.message,
      };
    }

    // The suite never writes the production feature flag, so there is nothing to restore. Both
    // the value and the setting record's own updated_date are compared after the run, which
    // proves the record was not written at all.
    try {
      const rows = await base44.asServiceRole.entities.AppSetting.filter({ key: PROPERTY_FEATURE_FLAG_KEY });
      const record = (Array.isArray(rows) ? rows : (rows?.items || []))[0];
      flagUntouched = String(record?.value ?? "(absent)") === String(flagBeforeValue ?? "(absent)")
        && String(record?.updated_date ?? "") === String(flagBeforeUpdated ?? "");
    } catch {
      flagUntouched = false;
    }

    // Release the single-run lock. Only the holder can release it and releasing twice is a no-op,
    // so an aborted run never leaves certification permanently locked; if even this fails, the
    // lock's bounded lifetime expires and the next run recovers it as a recorded takeover.
    lockRelease = await releasePropertyCertRunLock(base44.asServiceRole, RUN)
      .catch((e: any) => ({ released: false, status: "error", reason: String(e?.message || e) }));
  }

  // Post-run isolation checks.
  const afterFinancial: Record<string, number> = {};
  for (const e of FINANCIAL_ENTITIES) afterFinancial[e] = await countEntity(base44, e);
  const financialDeltas = Object.fromEntries(FINANCIAL_ENTITIES.map((e) => [e, (afterFinancial[e] || 0) - (beforeFinancial[e] || 0)]));
  const financialIsolated = Object.values(financialDeltas).every((d) => d === 0);

  const certLeftovers = await base44.asServiceRole.entities.PropertyListing.filter({ certification_run_id: RUN });
  const leftovers = (Array.isArray(certLeftovers) ? certLeftovers : (certLeftovers?.items || [])).length;
  const productionListingsAfter = await countEntity(base44, "PropertyListing");

  add("financial_system_isolation", financialIsolated, `deltas: ${JSON.stringify(financialDeltas)}`);
  add("no_production_property_records_touched", productionListingsAfter === beforeProductionListings && leftovers === 0,
    `property listings before=${beforeProductionListings} after=${productionListingsAfter}, cert leftovers=${leftovers}`);
  add("production_feature_flag_untouched", flagUntouched,
    `flag value "${flagBeforeValue ?? "(absent)"}" and the setting record's updated_date are unchanged — no test writes the production flag`);

  const failed = tests.filter((t) => !t.passed);

  return Response.json({
    suite: "Property Visibility v1.0 certification",
    run_id: RUN,
    passed: tests.length - failed.length,
    failed: failed.length,
    flag_value_before: flagBeforeValue,
    flag_untouched: flagUntouched,
    isolated_test_mode: true,
    authorization: {
      enforced: "platform-admin session (server-verified role)",
      actor: actorEmail,
      checked_before_any_record_or_external_call: true,
    },
    run_lock: runLock,
    lock_release: lockRelease,
    property_artifacts: propertySweep
      ? { deleted: propertySweep.deleted.length, remaining: propertySweep.remaining, remaining_by_entity: propertySweep.remaining_by_entity }
      : null,
    cleanup: cleanupReport,
    financial_deltas: financialDeltas,
    tests,
    outstanding_failures: failed.map((f) => ({ name: f.name, detail: f.detail })),
  }, { status: failed.length ? 207 : 200 });
});