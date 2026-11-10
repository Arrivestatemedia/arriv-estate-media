import {
  attributionLabel,
  looksAutomated,
  normalizeAttribution,
  operatingDay,
  trafficBucketKey,
} from "../../shared/propertyAttribution.ts";
import {
  LEAD_MAX_ATTEMPTS,
  buildLeadEmail,
  isDueForRetry,
  leadBackoffMinutes,
  nextDeliveryAttemptAt,
} from "../../shared/propertyLeadDelivery.ts";
import {
  STATUS_AUTO_DEACTIVATE_AFTER_DAYS,
  buildStructuredData,
  isPubliclyActive,
  needsStatusConfirmation,
  shouldAutoDeactivate,
} from "../../shared/propertyVisibility.ts";
import { actorOwnsListing } from "../../shared/propertyActor.ts";

// Automated verification of the Phase 1 rules.
//
// Every check is pure: it exercises the same functions the live paths use, with constructed inputs,
// and writes nothing — no records, no emails, no page changes. It runs as a normal backend function
// with no parameters and returns each check with its outcome.

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function baseListing(overrides: Record<string, any> = {}) {
  return {
    listing_id: "prop_phase1_test",
    public_slug: "1-test-lane-atlanta-ga-30327-abcd1234",
    client_email: "owner@example.com",
    property_address: "1 Test Lane",
    city: "Atlanta",
    state: "GA",
    zip: "30327",
    listing_price: 525000,
    bedrooms: 4,
    bathrooms: 3,
    square_footage: 2800,
    listing_status: "active",
    publication_state: "PUBLISHED",
    published_at: daysAgo(3),
    last_status_confirmed_at: daysAgo(3),
    canonical_url: "https://properties.example.test/properties/1-test-lane",
    seo_title: "Test title the customer approved",
    meta_description: "Test meta description the customer approved",
    property_description: "Test description the customer approved.",
    structured_data: { "@type": "RealEstateListing" },
    certification_mode: false,
    ...overrides,
  };
}

Deno.serve(async () => {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const check = (name: string, pass: boolean, detail = "") => checks.push({ name, pass: pass === true, detail });

  // ---------------------------------------------------------------- attribution
  const paid = normalizeAttribution({ utm_source: "facebook", utm_medium: "cpc", utm_campaign: "spring" });
  check("A paid campaign is classified as paid", paid.channel === "paid", paid.channel);

  const clickId = normalizeAttribution({ gclid: "abc123" });
  check("An advertising click id alone marks the visit paid", clickId.channel === "paid", clickId.channel);

  const organic = normalizeAttribution({ referrer: "https://www.google.com/search?q=homes+near+me" });
  check("A search engine referrer is classified as organic", organic.channel === "organic", organic.channel);
  check("The referring URL is cut down to its hostname", organic.referrer_host === "google.com", organic.referrer_host);

  const social = normalizeAttribution({ referrer: "https://instagram.com/p/xyz" });
  check("A social referrer is classified as social", social.channel === "social", social.channel);

  const direct = normalizeAttribution({});
  check("A visit with no signal is classified as direct", direct.channel === "direct", direct.channel);

  const internal = normalizeAttribution({ referrer: "https://app.arrivestatemedia.com/properties" }, ["arrivestatemedia.com"]);
  check("A visit from the app itself is classified as internal", internal.channel === "internal", internal.channel);

  const landing = normalizeAttribution({ landing_page: "https://x.test/a/b?email=buyer@example.com&token=secret" });
  check(
    "A landing page keeps only its path, never its query string",
    landing.landing_page === "/a/b",
    landing.landing_page,
  );

  const dirty = normalizeAttribution({ utm_source: "Face\nbook\tAds\u0000" });
  check("Control characters are stripped from campaign values", dirty.utm_source === "facebookads", dirty.utm_source);

  check(
    "A lead label names the campaign that produced it",
    attributionLabel({ utm_source: "facebook", utm_campaign: "spring", channel: "paid" }) === "facebook / spring",
    attributionLabel({ utm_source: "facebook", utm_campaign: "spring", channel: "paid" }),
  );

  check("A link preview fetcher is not counted as a visitor", looksAutomated("facebookexternalhit/1.1") === true);
  check("A real browser is counted", looksAutomated("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15") === false);
  check("A missing user agent is not counted", looksAutomated("") === true);

  const day = operatingDay(new Date("2026-03-01T03:30:00Z"));
  check("The traffic day is the operating day, not the UTC day", day === "2026-02-28", day);
  check(
    "The daily traffic bucket is deterministic",
    trafficBucketKey("prop_1", "2026-03-01", "paid") === "prop_1|2026-03-01|paid",
  );

  // ---------------------------------------------------------------- delivery
  const backoff = [1, 2, 3, 4, 5].map((attempt) => leadBackoffMinutes(attempt));
  check("The retry schedule never waits less than a minute", backoff[0] === 1, JSON.stringify(backoff));
  check(
    "The retry schedule grows and then holds",
    backoff.every((value, index) => index === 0 || value >= backoff[index - 1]) && backoff[4] === 240,
    JSON.stringify(backoff),
  );
  check(
    "The next attempt is in the future",
    new Date(nextDeliveryAttemptAt(2)).getTime() > Date.now(),
  );
  check("Delivery gives up after five attempts", LEAD_MAX_ATTEMPTS === 5, String(LEAD_MAX_ATTEMPTS));

  const dueNow = isDueForRetry({ notification_status: "pending_agent_delivery", delivery_attempts: 0 });
  check("A never-attempted inquiry is due", dueNow === true);
  check(
    "An inquiry inside its backoff window is not retried early",
    isDueForRetry({
      notification_status: "retrying",
      delivery_attempts: 2,
      next_delivery_attempt_at: new Date(Date.now() + 600000).toISOString(),
    }) === false,
  );
  check(
    "An inquiry past its backoff window is retried",
    isDueForRetry({
      notification_status: "retrying",
      delivery_attempts: 2,
      next_delivery_attempt_at: new Date(Date.now() - 60000).toISOString(),
    }) === true,
  );
  check("A delivered inquiry is never re-sent by the sweep", isDueForRetry({ notification_status: "delivered", delivery_attempts: 1 }) === false);
  check("An exhausted inquiry is never retried", isDueForRetry({ notification_status: "retrying", delivery_attempts: 5 }) === false);
  check("A synthetic inquiry is never emailed", isDueForRetry({ notification_status: "pending_agent_delivery", certification_mode: true }) === false);

  const email = buildLeadEmail(
    {
      name: "Dana Buyer",
      email: "dana@example.com",
      phone: "4045551212",
      message: 'Interested. <script>alert("x")</script>',
      property_reference: "ARRIV-ABCDEF",
      utm_source: "facebook",
      utm_campaign: "spring",
      channel: "paid",
    },
    baseListing(),
  );
  check("The agent email names the property", email.subject.includes("1 Test Lane"), email.subject);
  check("The agent email carries the buyer's message", email.html.includes("Interested."));
  check("The agent email cannot break out of its own markup", !email.html.includes("<script"), "escaped");
  check("The agent email names the channel the lead came from", email.html.includes("facebook / spring"));

  // ---------------------------------------------------------------- structured data
  const listing = baseListing();
  const structured = buildStructuredData(listing, listing.canonical_url);
  check("Structured data carries the listing price", structured?.offers?.price === 525000, JSON.stringify(structured?.offers));
  check("Structured data carries the address", structured?.address?.addressLocality === "Atlanta");

  const repriced = buildStructuredData({ ...listing, listing_price: 499000 }, listing.canonical_url);
  check("A price change moves into the structured data", repriced?.offers?.price === 499000, JSON.stringify(repriced?.offers));
  check(
    "Rebuilding structured data never rewrites the approved text",
    repriced?.name === listing.seo_title && repriced?.description === listing.meta_description,
  );

  // ---------------------------------------------------------------- lifecycle
  const fresh = baseListing({ last_status_confirmed_at: daysAgo(5) });
  const monthOld = baseListing({ last_status_confirmed_at: daysAgo(31) });
  const stale = baseListing({ last_status_confirmed_at: daysAgo(STATUS_AUTO_DEACTIVATE_AFTER_DAYS + 1) });
  const soldStale = baseListing({ last_status_confirmed_at: daysAgo(90), listing_status: "sold" });

  check("A freshly confirmed listing triggers nothing", !needsStatusConfirmation(fresh) && !shouldAutoDeactivate(fresh));
  check("A listing unconfirmed for 31 days asks for confirmation", needsStatusConfirmation(monthOld) === true);
  check("A listing unconfirmed for 31 days is not unpublished", shouldAutoDeactivate(monthOld) === false);
  check("A listing unconfirmed for 61 days is unpublished", shouldAutoDeactivate(stale) === true);
  check("A sold listing is never auto-unpublished by this rule", shouldAutoDeactivate(soldStale) === false);
  check("A sold listing is not shown as available", isPubliclyActive(soldStale) === false);

  // ---------------------------------------------------------------- paid independence
  const expiredPaid = baseListing({
    visibility_plus_until: daysAgo(400),
    visibility_pro_until: daysAgo(400),
    placement_tier: "none",
    promotion_expired: true,
  });
  check(
    "An expired paid promotion never takes the free page down",
    isPubliclyActive(expiredPaid) === true,
  );
  const unpublished = baseListing({ publication_state: "UNPUBLISHED" });
  check("Unpublishing still removes the page, whatever was paid", isPubliclyActive(unpublished) === false);

  // ---------------------------------------------------------------- lead access
  const customer = { email: "owner@example.com", type: "customer" as const, isAdmin: false, clientEmail: "owner@example.com" };
  const stranger = { email: "stranger@example.com", type: "customer" as const, isAdmin: false, clientEmail: "stranger@example.com" };
  const admin = { email: "admin@example.com", type: "admin" as const, isAdmin: true, clientEmail: "" };

  check("A customer reads the leads on their own property", actorOwnsListing(baseListing(), customer) === true);
  check(
    "A customer cannot read another customer's leads",
    actorOwnsListing(baseListing({ client_email: "someone.else@example.com" }), stranger) === false,
  );
  check("Ownership is decided without regard to letter case", actorOwnsListing(baseListing(), { ...customer, clientEmail: "OWNER@Example.com" }) === true);
  check("An administrator may read any listing's leads", actorOwnsListing(baseListing({ client_email: "someone.else@example.com" }), admin) === true);
  check("A signed-out visitor owns nothing", actorOwnsListing(baseListing(), { ...stranger, clientEmail: "" }) === false);

  const passed = checks.filter((entry) => entry.pass).length;
  return Response.json({
    ok: passed === checks.length,
    passed,
    total: checks.length,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name),
    checks,
    wrote_nothing: true,
  });
});