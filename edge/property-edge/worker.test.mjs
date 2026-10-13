// Automated tests for the Arriv property edge serving layer.
//
// These exercise the real worker file with the origin fetch and the cache stubbed, so they are
// hermetic: no network, no Cloudflare account, no Base44 invocation, no production record, and no
// feature flag is ever touched. Run them with `node --test` from this folder.

import { __test } from "./worker.mjs";

const ORIGIN = "https://app.arrivestatemedia.example";
const PUBLIC_HOST = "properties.arrivestatemedia.example";

const SLUG = "123-maple-street-bethesda-md-ab12cd34";
const LISTING_ID = "prop_ab12cd34";
const FILE_ID = "file_exterior_1";
const DRIVE_STYLE_FILE_ID = "1AbC_DeF-GhI.Jk";

const INDEXABLE_HTML = `<!doctype html><html><head>
<title>123 Maple Street, Bethesda MD</title>
<meta name="description" content="Four bedroom home." />
<link rel="canonical" href="${ORIGIN}/properties/${SLUG}" />
<meta property="og:title" content="123 Maple Street, Bethesda MD" />
<meta property="og:image" content="${ORIGIN}/functions/streamPropertyMedia?listing=${LISTING_ID}&amp;file=${FILE_ID}" />
<script type="application/ld+json">{"@type":"RealEstateListing","name":"123 Maple Street"}</script>
</head><body><h1>123 Maple Street</h1></body></html>`;

const NOINDEX_HTML = `<!doctype html><html><head>
<title>123 Maple Street, Bethesda MD</title>
<meta name="robots" content="noindex,follow" />
</head><body><h1>Sold</h1></body></html>`;

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${ORIGIN}/properties/${SLUG}</loc>\n  </url>\n</urlset>`;

function makeHarness(options = {}) {
  const {
    html = INDEXABLE_HTML,
    mediaStatus = 200,
    sitemapStatus = 200,
    pageType = "text/html; charset=utf-8",
    mediaType = "image/jpeg",
    sitemapType = "application/xml; charset=utf-8",
    serverError = false,
    stubbornDelete = false,
  } = options;

  const calls = [];
  const requests = [];
  const store = new Map();
  const deleted = [];

  const cache = {
    async match(request) {
      const hit = store.get(request.url);
      return hit ? hit.clone() : undefined;
    },
    async put(request, response) {
      store.set(request.url, response.clone());
    },
    async delete(request) {
      deleted.push(request.url);
      if (stubbornDelete) return true;
      return store.delete(request.url);
    },
  };

  const fetchStub = async (request) => {
    const url = typeof request === "string" ? request : request.url;
    const headers = typeof request === "string" ? {} : Object.fromEntries(request.headers.entries());
    calls.push(url);
    requests.push({ url, headers });

    if (serverError) return new Response("upstream unavailable", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    if (url.includes("/functions/getPublicPropertyPage")) {
      if (html === null) return new Response("not found", { status: 404, headers: { "Content-Type": "text/plain" } });
      return new Response(html, { status: 200, headers: { "Content-Type": pageType, "Cache-Control": "public, max-age=300" } });
    }
    if (url.includes("/functions/streamPropertyMedia")) {
      if (mediaStatus !== 200) return new Response("not found", { status: mediaStatus, headers: { "Content-Type": "text/plain" } });
      return new Response("JPEGBYTES", { status: 200, headers: { "Content-Type": mediaType, "Cache-Control": "public, max-age=86400" } });
    }
    if (url.includes("/functions/generatePropertySitemap")) {
      if (sitemapStatus !== 200) return new Response("nope", { status: sitemapStatus, headers: { "Content-Type": "text/plain" } });
      return new Response(SITEMAP_XML, { status: 200, headers: { "Content-Type": sitemapType } });
    }
    return new Response("unexpected origin call", { status: 500 });
  };

  const env = {
    ORIGIN_BASE: ORIGIN,
    PUBLIC_HOST,
    PROPERTY_EDGE_DISABLED: "false",
    PURGE_SECRET: "test-secret",
    HTML_TTL_SECONDS: "300",
    MEDIA_TTL_SECONDS: "300",
    SITEMAP_TTL_SECONDS: "900",
    NOT_FOUND_TTL_SECONDS: "60",
    __test_fetch: fetchStub,
    __test_cache: cache,
  };

  return { env, calls, requests, store, deleted: () => deleted };
}

function get(path, headers = {}, method = "GET") {
  return new Request(`https://${PUBLIC_HOST}${path}`, { method, headers });
}

async function postPurge(body, { secret = "test-secret", timestamp = String(Math.floor(Date.now() / 1000)), host = PUBLIC_HOST } = {}) {
  const raw = JSON.stringify(body);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${raw}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request(`https://${host}/__purge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-arriv-signature": mac, "x-arriv-timestamp": timestamp },
    body: raw,
  });
}

export async function runWorkerTests(worker) {
  const results = [];
  const check = (name, passed, detail = "") => results.push({ name, passed, detail });

  // ============================================================ crawlable HTML
  {
    const h = makeHarness();
    const res = await worker.fetch(get(`/${SLUG}`), h.env);
    const body = await res.text();
    check(
      "serves_crawlable_html_at_the_canonical_url",
      res.status === 200 &&
        String(res.headers.get("content-type")).includes("text/html") &&
        /<title>123 Maple Street/.test(body) &&
        /rel="canonical"/.test(body) &&
        res.headers.get("x-robots-tag") === "index, follow",
      `status=${res.status}, robots=${res.headers.get("x-robots-tag")}, origin calls=${h.calls.length}`,
    );
    check(
      "structured_data_and_social_metadata_reach_the_crawler",
      /<script type="application\/ld\+json">/.test(body) && /RealEstateListing/.test(body) && /property="og:title"/.test(body) && /property="og:image"/.test(body),
      "JSON-LD plus og:title and og:image are present in the served copy",
    );
    check(
      "rewrites_origin_host_to_the_public_host",
      body.includes(`https://${PUBLIC_HOST}/properties/${SLUG}`) &&
        body.includes(`https://${PUBLIC_HOST}/functions/streamPropertyMedia`) &&
        !body.includes(`https://${new URL(ORIGIN).host}`),
      "canonical and media URLs in the served copy point at the public host",
    );
  }
  {
    const h = makeHarness();
    check("serves_the_compatibility_path", (await worker.fetch(get(`/properties/${SLUG}`), h.env)).status === 200, "GET /properties/<slug> also serves the page");
    check("trailing_slash_is_normalised", (await worker.fetch(get(`/${SLUG}/`), h.env)).status === 200, "GET /<slug>/ resolves to the same page");
  }
  {
    const h = makeHarness();
    const bare = await worker.fetch(get("/"), h.env);
    check(
      "bare_domain_redirects_to_the_directory",
      bare.status === 301 && bare.headers.get("location") === `https://${PUBLIC_HOST}/properties` && h.calls.length === 0,
      `status=${bare.status}, location=${bare.headers.get("location")}, origin calls=${h.calls.length}`,
    );
    const withSlash = await worker.fetch(get("//"), h.env);
    check(
      "bare_domain_redirect_is_stable_with_a_trailing_slash",
      withSlash.status === 301 && withSlash.headers.get("location") === `https://${PUBLIC_HOST}/properties`,
      `status=${withSlash.status}, location=${withSlash.headers.get("location")}`,
    );
  }
  {
    const h = makeHarness();
    await worker.fetch(get(`/${SLUG}`), h.env);
    const second = await worker.fetch(get(`/properties/${SLUG}`), h.env);
    check("both_page_paths_share_one_cache_entry", second.status === 200 && h.calls.length === 1, `origin calls for both paths=${h.calls.length}`);
  }
  {
    const h = makeHarness();
    const res = await worker.fetch(get(`/${SLUG}`, {}, "HEAD"), h.env);
    const body = await res.text();
    check(
      "head_returns_headers_without_a_body",
      res.status === 200 && String(res.headers.get("content-type")).includes("text/html") && body === "",
      `status=${res.status}, body length=${body.length}`,
    );
  }

  // ============================================================ availability state
  {
    const h = makeHarness({ html: NOINDEX_HTML });
    const res = await worker.fetch(get(`/${SLUG}`), h.env);
    check("propagates_noindex_for_a_listing_that_is_not_available", res.status === 200 && res.headers.get("x-robots-tag") === "noindex, follow", `robots=${res.headers.get("x-robots-tag")}`);
  }

  // ============================================================ sitemap and robots
  {
    const h = makeHarness();
    const res = await worker.fetch(get("/sitemap.xml"), h.env);
    const xml = await res.text();
    check(
      "sitemap_is_served_as_xml_on_the_public_host",
      res.status === 200 && String(res.headers.get("content-type")).includes("xml") && xml.includes(`https://${PUBLIC_HOST}/properties/${SLUG}`) && !xml.includes(new URL(ORIGIN).host),
      `content-type=${res.headers.get("content-type")}, canonical host rewritten`,
    );
    const second = await worker.fetch(get("/sitemap.xml"), h.env);
    check("sitemap_is_cached", second.status === 200 && h.calls.length === 1, `origin calls=${h.calls.length}`);
  }
  {
    const h = makeHarness();
    const res = await worker.fetch(get("/robots.txt"), h.env);
    const body = await res.text();
    check(
      "robots_directives_point_at_the_public_sitemap",
      res.status === 200 &&
        /User-agent: \*/.test(body) &&
        body.includes(`Sitemap: https://${PUBLIC_HOST}/sitemap.xml`) &&
        body.includes("Disallow: /functions/") &&
        body.includes("Disallow: /__purge") &&
        body.includes("Disallow: /__health") &&
        h.calls.length === 0,
      "robots.txt generated at the edge, operator endpoints and the duplicate media path disallowed, no origin call",
    );
  }

  // ============================================================ caching efficiency
  {
    const h = makeHarness();
    const first = await worker.fetch(get(`/${SLUG}`), h.env);
    const second = await worker.fetch(get(`/${SLUG}`), h.env);
    check(
      "second_page_view_is_served_from_cache_without_an_origin_call",
      second.status === 200 && h.calls.length === 1 && first.headers.get("x-arriv-edge") === "MISS" && second.headers.get("x-arriv-edge") === "HIT",
      `origin calls after two views=${h.calls.length}, tags=${first.headers.get("x-arriv-edge")}/${second.headers.get("x-arriv-edge")}`,
    );
  }
  {
    const h = makeHarness();
    const responses = await Promise.all(Array.from({ length: 5 }, () => worker.fetch(get(`/${SLUG}`), h.env)));
    check(
      "concurrent_requests_share_one_origin_call",
      responses.every((r) => r.status === 200) && h.calls.length === 1,
      `5 concurrent views produced ${h.calls.length} origin call(s)`,
    );
  }
  {
    const h = makeHarness();
    const first = await worker.fetch(get(`/functions/streamPropertyMedia?listing=${LISTING_ID}&file=${FILE_ID}`), h.env);
    const second = await worker.fetch(get(`/functions/streamPropertyMedia?file=${FILE_ID}&listing=${LISTING_ID}`), h.env);
    check(
      "approved_media_is_streamed_and_cached_with_a_bounded_ttl",
      first.status === 200 &&
        first.headers.get("content-type") === "image/jpeg" &&
        first.headers.get("cache-control") === "public, max-age=300" &&
        second.headers.get("cache-control") === "public, max-age=300" &&
        h.calls.length === 1,
      `ttl=${first.headers.get("cache-control")} (origin offered 86400, capped by the edge), parameter order does not create a second entry, origin calls=${h.calls.length}`,
    );
  }
  {
    const h = makeHarness();
    const res = await worker.fetch(get(`/${SLUG}?utm_source=newsletter`), h.env);
    check("cache_keys_are_not_affected_by_unrelated_query_parameters", res.status === 200 && h.calls.length === 1, "page lookup is by slug only");
  }

  // ============================================================ authorization and isolation
  {
    const h = makeHarness({ html: null });
    const res = await worker.fetch(get(`/${SLUG}`), h.env);
    check("origin_refusal_becomes_404_and_is_never_cached_as_content", res.status === 404 && res.headers.get("cache-control") === "public, max-age=60" && h.store.size === 0, `status=${res.status}, cache entries=${h.store.size}`);
  }
  {
    const h = makeHarness({ html: null });
    const res = await worker.fetch(get("/no-such-property-ab12cd34"), h.env);
    check(
      "an_unknown_slug_is_resolved_by_the_origin_and_refused_uncached",
      res.status === 404 && h.calls.length === 1 && h.store.size === 0,
      `status=${res.status}, origin calls=${h.calls.length} (the edge cannot know which slugs exist, so the authority is asked and refuses), nothing cached`,
    );
  }
  {
    const h = makeHarness();
    const res = await worker.fetch(get("/Not_A_Slug.file"), h.env);
    check("a_path_that_cannot_be_a_slug_is_refused_at_the_edge", res.status === 404 && h.calls.length === 0, `status=${res.status}, origin calls=${h.calls.length} — only slug-shaped paths are ever proxied`);
  }
  {
    const h = makeHarness({ mediaStatus: 404 });
    const res = await worker.fetch(get(`/media/prop_other_customer/their_private_file`), h.env);
    check(
      "cross_listing_media_is_decided_by_the_origin_and_the_refusal_is_not_cached",
      res.status === 404 && h.calls.length === 1 && h.calls[0].includes("listing=prop_other_customer") && h.store.size === 0,
      `status=${res.status}, authorization left to the origin (which owns the approved selection), nothing cached`,
    );
  }
  {
    const h = makeHarness({ mediaStatus: 404 });
    const res = await worker.fetch(get(`/media/${LISTING_ID}/${FILE_ID}`), h.env);
    check("unauthorised_or_unpublished_media_is_404_and_not_cached", res.status === 404 && h.store.size === 0, `status=${res.status}, cache entries=${h.store.size}`);
  }
  {
    const h = makeHarness();
    const first = await worker.fetch(get(`/media/${LISTING_ID}/${FILE_ID}`), h.env);
    const second = await worker.fetch(get(`/media/${LISTING_ID}/${FILE_ID}`), h.env);
    check("media_alias_path_maps_to_the_same_gated_origin_call", first.status === 200 && second.status === 200 && h.calls.length === 1 && h.calls[0].includes("/functions/streamPropertyMedia"), `origin calls=${h.calls.length}`);
  }
  {
    const h = makeHarness();
    const res = await worker.fetch(get(`/media/${LISTING_ID}/${DRIVE_STYLE_FILE_ID}`), h.env);
    check(
      "drive_style_file_ids_are_accepted_on_the_media_alias",
      res.status === 200 && h.calls.length === 1 && h.calls[0].includes(`file=${DRIVE_STYLE_FILE_ID}`),
      `status=${res.status} for a mixed-case id containing a dot (a slug-shaped pattern would have rejected it)`,
    );
  }
  {
    const h = makeHarness();
    const withCredentials = await worker.fetch(get(`/${SLUG}`, { cookie: "session=abc123" }), h.env);
    const anonymous = await worker.fetch(get(`/${SLUG}`), h.env);
    check(
      "authenticated_requests_bypass_the_cache_and_are_not_stored",
      withCredentials.status === 200 &&
        String(withCredentials.headers.get("cache-control")).includes("no-store") &&
        withCredentials.headers.get("x-arriv-edge") === "BYPASS" &&
        anonymous.headers.get("x-arriv-edge") === "MISS" &&
        h.calls.length === 2,
      `credentialed tag=${withCredentials.headers.get("x-arriv-edge")}, anonymous tag=${anonymous.headers.get("x-arriv-edge")} (a private view can never become the shared copy)`,
    );
    check(
      "client_credentials_are_never_forwarded_to_the_origin",
      h.requests.every((r) => !r.headers.cookie && !r.headers.authorization),
      `${h.requests.length} origin request(s) carried no cookie and no Authorization header`,
    );
  }

  // ============================================================ error responses
  {
    const h = makeHarness({ serverError: true });
    const page = await worker.fetch(get(`/${SLUG}`), h.env);
    const media = await worker.fetch(get(`/media/${LISTING_ID}/${FILE_ID}`), h.env);
    const sitemap = await worker.fetch(get("/sitemap.xml"), h.env);
    check(
      "origin_outage_is_503_and_is_never_cached",
      page.status === 503 &&
        media.status === 503 &&
        sitemap.status === 503 &&
        page.headers.get("cache-control") === "no-store" &&
        page.headers.get("x-robots-tag") === "noindex, nofollow" &&
        h.store.size === 0,
      `statuses=${page.status}/${media.status}/${sitemap.status} — an outage is never reported as a 404, which would tell search engines a live page had gone`,
    );
  }
  {
    const h = makeHarness({ html: '{"ok":true}', pageType: "application/json" });
    const page = await worker.fetch(get(`/${SLUG}`), h.env);
    const mediaHarness = makeHarness({ mediaType: "application/json" });
    const media = await worker.fetch(get(`/media/${LISTING_ID}/${FILE_ID}`), mediaHarness.env);
    check(
      "unexpected_content_types_are_passed_through_uncached",
      page.status === 200 && page.headers.get("cache-control") === "no-store" && h.store.size === 0 && media.headers.get("cache-control") === "no-store" && mediaHarness.store.size === 0,
      "a JSON envelope can never be stored as a page or as media",
    );
  }
  {
    const h = makeHarness();
    const res = await worker.fetch(new Request(`https://${PUBLIC_HOST}/${SLUG}`, { method: "POST" }), h.env);
    check("non_read_methods_are_refused", res.status === 405 && res.headers.get("allow") === "GET, HEAD" && h.calls.length === 0, `status=${res.status}`);
  }
  {
    const h = makeHarness();
    const res = await worker.fetch(get("/__health"), h.env);
    const body = await res.json();
    check(
      "health_reports_configuration_state_without_secrets",
      res.status === 200 &&
        body.disabled === false &&
        body.purge_secret_configured === true &&
        body.host === PUBLIC_HOST &&
        body.ttl_seconds?.media === 300 &&
        !JSON.stringify(body).includes("test-secret"),
      "health exposes switch state and TTLs, never a secret value",
    );
  }

  // ============================================================ emergency shutdown
  {
    const h = makeHarness();
    const disabled = { ...h.env, PROPERTY_EDGE_DISABLED: "true" };
    const page = await worker.fetch(get(`/${SLUG}`), disabled);
    const media = await worker.fetch(get(`/media/${LISTING_ID}/${FILE_ID}`), disabled);
    const sitemap = await worker.fetch(get("/sitemap.xml"), disabled);
    check(
      "kill_switch_refuses_every_public_path_without_reading_the_cache",
      page.status === 503 &&
        media.status === 503 &&
        sitemap.status === 503 &&
        page.headers.get("cache-control") === "no-store, no-cache, must-revalidate, max-age=0" &&
        page.headers.get("x-arriv-edge") === "KILL-SWITCH" &&
        h.calls.length === 0 &&
        h.store.size === 0,
      `statuses=${page.status}/${media.status}/${sitemap.status}, origin calls=${h.calls.length}, cache untouched`,
    );
    const health = await worker.fetch(get("/__health"), disabled);
    check("health_reports_the_disabled_state", health.status === 200 && (await health.json()).disabled === true, "liveness endpoint reports disabled=true");
  }
  {
    const h = makeHarness();
    const disabled = { ...h.env, PROPERTY_EDGE_DISABLED: "true" };
    const res = await worker.fetch(await postPurge({ slug: SLUG, verify: true }), disabled);
    const payload = await res.json();
    check("purge_stays_reachable_while_the_kill_switch_is_on", res.status === 200 && payload.ok === true && payload.verified === true, "an operator can clear the cache and keep the surface dark");
  }

  // ============================================================ cache invalidation
  {
    const h = makeHarness();
    await worker.fetch(get(`/${SLUG}`), h.env);
    await worker.fetch(get(`/media/${LISTING_ID}/${FILE_ID}`), h.env);
    await worker.fetch(get("/sitemap.xml"), h.env);
    const before = h.calls.length;

    const purge = await postPurge({ listing_id: LISTING_ID, slug: SLUG, file_ids: [FILE_ID] });
    const res = await worker.fetch(purge, h.env);
    const payload = await res.json();
    const removed = h.deleted();
    check(
      "signed_purge_removes_the_page_sitemap_and_media_keys",
      res.status === 200 &&
        payload.ok === true &&
        removed.some((u) => u.endsWith(`/properties/${SLUG}`)) &&
        removed.some((u) => u.endsWith(`/${SLUG}`)) &&
        removed.some((u) => u.includes("streamPropertyMedia")) &&
        removed.some((u) => u.endsWith("/sitemap.xml")),
      `${payload.purged.length}/${payload.requested} keys removed, including both page paths, the sitemap and each media asset`,
    );

    const after = await worker.fetch(get(`/${SLUG}`), h.env);
    check("purge_forces_the_next_page_view_to_revalidate_at_the_origin", after.status === 200 && h.calls.length === before + 1, `origin calls before=${before} after=${h.calls.length}`);
  }
  {
    const h = makeHarness();
    await worker.fetch(get(`/media/${LISTING_ID}/${DRIVE_STYLE_FILE_ID}`), h.env);
    const res = await worker.fetch(await postPurge({ listing_id: LISTING_ID, file_ids: [DRIVE_STYLE_FILE_ID] }), h.env);
    const payload = await res.json();
    check(
      "signed_purge_removes_the_alias_key_for_drive_style_ids",
      res.status === 200 &&
        payload.purged.some((u) => u.includes("streamPropertyMedia")) &&
        h.deleted().some((u) => u.endsWith(`/media/${LISTING_ID}/${DRIVE_STYLE_FILE_ID}`)),
      "a real Drive file id (mixed case, dot) is accepted, its cached stream key is dropped, and the /media alias key is targeted too",
    );
  }
  {
    const h = makeHarness();
    await worker.fetch(get(`/${SLUG}`), h.env);
    await worker.fetch(get(`/media/${LISTING_ID}/${FILE_ID}`), h.env);
    const res = await worker.fetch(await postPurge({ listing_id: LISTING_ID, slug: SLUG, file_ids: [FILE_ID], verify: true }), h.env);
    const payload = await res.json();
    check(
      "purge_can_verify_that_the_keys_are_gone",
      res.status === 200 && payload.ok === true && payload.verified === true && payload.remaining.length === 0 && payload.requested >= 4,
      `verified=${payload.verified} across ${payload.requested} keys — this is what the production activation checklist gates on`,
    );
  }
  {
    const h = makeHarness({ stubbornDelete: true });
    await worker.fetch(get(`/${SLUG}`), h.env);
    const res = await worker.fetch(await postPurge({ slug: SLUG, verify: true }), h.env);
    const payload = await res.json();
    check(
      "purge_reports_verification_failure_when_a_key_survives",
      res.status === 200 && payload.ok === false && payload.verified === false && payload.remaining.length > 0,
      `verified=${payload.verified} with ${payload.remaining.length} key(s) still present — activation must not be approved on this outcome`,
    );
  }
  {
    const h = makeHarness();
    const badSignature = await worker.fetch(await postPurge({ slug: SLUG }, { secret: "wrong-secret" }), h.env);
    const stale = await worker.fetch(await postPurge({ slug: SLUG }, { timestamp: String(Math.floor(Date.now() / 1000) - 3600) }), h.env);
    const empty = await worker.fetch(new Request(`https://${PUBLIC_HOST}/__purge`, { method: "POST", body: "{}" }), h.env);
    check(
      "purge_rejects_a_bad_signature_and_a_replayed_timestamp",
      badSignature.status === 401 && stale.status === 401 && empty.status === 401,
      `bad signature=${badSignature.status}, stale timestamp=${stale.status}, unsigned=${empty.status}`,
    );
  }

  return results;
}

// `node --test` entry point.
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("worker.test.mjs")) {
  const worker = (await import("./worker.mjs")).default;
  const results = await runWorkerTests(worker);
  for (const r of results) console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

export { __test };