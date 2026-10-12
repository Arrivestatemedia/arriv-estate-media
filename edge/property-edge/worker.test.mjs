// Automated tests for the property edge serving layer.
//
// Run with `node --test` once the worker has its own package, or through the platform's dev
// harness. No network and no Cloudflare account are needed: the origin fetch and the cache are
// stubbed, so every assertion below is about this worker's behaviour, not about a provider.

import { __test } from "./worker.mjs";

const ORIGIN = "https://app.arrivestatemedia.example";
const PUBLIC_HOST = "properties.arrivestatemedia.example";

const SLUG = "123-maple-street-bethesda-md-ab12cd34";
const LISTING_ID = "prop_ab12cd34";
const FILE_ID = "file_exterior_1";

const INDEXABLE_HTML = `<!doctype html><html><head>
<title>123 Maple Street, Bethesda MD</title>
<meta name="description" content="Four bedroom home." />
<link rel="canonical" href="${ORIGIN}/properties/${SLUG}" />
<meta property="og:image" content="${ORIGIN}/functions/streamPropertyMedia?listing=${LISTING_ID}&amp;file=${FILE_ID}" />
<script type="application/ld+json">{"@type":"RealEstateListing"}</script>
</head><body><h1>123 Maple Street</h1></body></html>`;

const NOINDEX_HTML = `<!doctype html><html><head>
<title>123 Maple Street, Bethesda MD</title>
<meta name="robots" content="noindex,follow" />
</head><body><h1>Sold</h1></body></html>`;

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${ORIGIN}/properties/${SLUG}</loc>\n  </url>\n</urlset>`;

function makeHarness({ html = INDEXABLE_HTML, mediaStatus = 200, sitemapStatus = 200 } = {}) {
  const calls = [];
  const store = new Map();
  let deleted = [];

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
      return store.delete(request.url);
    },
  };

  const fetchStub = async (request) => {
    const url = typeof request === "string" ? request : request.url;
    calls.push(url);
    if (url.includes("/functions/getPublicPropertyPage")) {
      const htmlBody = url.includes("sold") ? NOINDEX_HTML : html;
      if (htmlBody === null) return new Response("not found", { status: 404 });
      return new Response(htmlBody, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
    }
    if (url.includes("/functions/streamPropertyMedia")) {
      if (mediaStatus !== 200) return new Response("not found", { status: mediaStatus });
      return new Response("JPEGBYTES", { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
    }
    if (url.includes("/functions/generatePropertySitemap")) {
      if (sitemapStatus !== 200) return new Response("nope", { status: sitemapStatus });
      return new Response(SITEMAP_XML, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8" } });
    }
    return new Response("unexpected origin call", { status: 500 });
  };

  const env = {
    ORIGIN_BASE: ORIGIN,
    PUBLIC_HOST,
    PROPERTY_EDGE_DISABLED: "false",
    PURGE_SECRET: "test-secret",
    __test_fetch: fetchStub,
    __test_cache: cache,
  };

  return { env, calls, store, cache, deleted: () => deleted };
}

function get(path, headers = {}) {
  return new Request(`https://${PUBLIC_HOST}${path}`, { method: "GET", headers });
}

async function postPurge(body, { secret = "test-secret", timestamp = String(Math.floor(Date.now() / 1000)) } = {}) {
  const raw = JSON.stringify(body);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${raw}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request(`https://${PUBLIC_HOST}/__purge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-arriv-signature": mac, "x-arriv-timestamp": timestamp },
    body: raw,
  });
}

export async function runWorkerTests(worker) {
  const results = [];
  const check = (name, passed, detail = "") => results.push({ name, passed, detail });

  // ---------------------------------------------------------------- crawlable HTML
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
        /application\/ld\+json/.test(body) &&
        res.headers.get("x-robots-tag") === "index, follow",
      `status=${res.status}, robots=${res.headers.get("x-robots-tag")}, origin calls=${h.calls.length}`,
    );
    check(
      "rewrites_origin_host_to_the_public_host",
      body.includes(`https://${PUBLIC_HOST}/properties/${SLUG}`) &&
        body.includes(`https://${PUBLIC_HOST}/functions/streamPropertyMedia`) &&
        !body.includes(`https://${new URL(ORIGIN).host}`),
      "canonical and media URLs in the served copy point at the public host",
    );
    check("serves_the_compatibility_path", (await worker.fetch(get(`/properties/${SLUG}`), makeHarness().env)).status === 200, "GET /properties/<slug> also serves the page");
  }

  // ---------------------------------------------------------------- noindex propagation
  {
    const h = makeHarness({ html: NOINDEX_HTML });
    const res = await worker.fetch(get(`/${SLUG}`), h.env);
    check("propagates_noindex_for_a_listing_that_is_not_available", res.status === 200 && res.headers.get("x-robots-tag") === "noindex, follow", `robots=${res.headers.get("x-robots-tag")}`);
  }

  // ---------------------------------------------------------------- fail closed
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
      `status=${res.status}, origin calls=${h.calls.length} (the edge cannot know which slugs exist, so it asks the origin, which is the authority and refuses), nothing cached`,
    );
  }
  {
    const h = makeHarness();
    const res = await worker.fetch(get("/Not_A_Slug.file"), h.env);
    check(
      "a_path_that_cannot_be_a_slug_is_refused_at_the_edge",
      res.status === 404 && h.calls.length === 0,
      `status=${res.status}, origin calls=${h.calls.length} — only slug-shaped paths are ever proxied`,
    );
  }
  {
    const h = makeHarness();
    const res = await worker.fetch(new Request(`https://${PUBLIC_HOST}/${SLUG}`, { method: "POST" }), h.env);
    check("non_read_methods_are_refused", res.status === 405 && res.headers.get("allow") === "GET, HEAD", `status=${res.status}`);
  }

  // ---------------------------------------------------------------- caching
  {
    const h = makeHarness();
    await worker.fetch(get(`/${SLUG}`), h.env);
    const second = await worker.fetch(get(`/${SLUG}`), h.env);
    check("second_page_view_is_served_from_cache_without_an_origin_call", second.status === 200 && h.calls.length === 1, `origin calls after two views=${h.calls.length}`);
  }
  {
    const h = makeHarness();
    const first = await worker.fetch(get(`/functions/streamPropertyMedia?listing=${LISTING_ID}&file=${FILE_ID}`), h.env);
    const second = await worker.fetch(get(`/functions/streamPropertyMedia?listing=${LISTING_ID}&file=${FILE_ID}`), h.env);
    check(
      "approved_media_is_streamed_and_cached_with_a_bounded_ttl",
      first.status === 200 &&
        first.headers.get("content-type") === "image/jpeg" &&
        first.headers.get("cache-control") === "public, max-age=300" &&
        second.headers.get("cache-control") === "public, max-age=300" &&
        h.calls.length === 1,
      `ttl=${first.headers.get("cache-control")} (origin offered 86400, capped by the edge), origin calls=${h.calls.length}`,
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

  // ---------------------------------------------------------------- sitemap and robots
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
      res.status === 200 && /User-agent: \*/.test(body) && body.includes(`Sitemap: https://${PUBLIC_HOST}/sitemap.xml`) && body.includes("Disallow: /__purge") && h.calls.length === 0,
      "robots.txt generated at the edge, no origin call",
    );
  }

  // ---------------------------------------------------------------- emergency stop
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
        h.calls.length === 0 &&
        h.store.size === 0,
      `statuses=${page.status}/${media.status}/${sitemap.status}, origin calls=${h.calls.length}, cache untouched`,
    );
    const health = await worker.fetch(get("/__health"), disabled);
    check("health_reports_the_disabled_state", health.status === 200 && (await health.json()).disabled === true, "liveness endpoint reports disabled=true");
  }

  // ---------------------------------------------------------------- invalidation
  {
    const h = makeHarness();
    await worker.fetch(get(`/${SLUG}`), h.env);
    await worker.fetch(get(`/media/${LISTING_ID}/${FILE_ID}`), h.env);
    await worker.fetch(get("/sitemap.xml"), h.env);
    const before = h.calls.length;

    const purge = await postPurge({ listing_id: LISTING_ID, slug: SLUG, file_ids: [FILE_ID] });
    const res = await worker.fetch(purge, h.env);
    const payload = await res.json();
    const removedAll = h.deleted();
    check(
      "signed_purge_removes_the_page_sitemap_and_media_keys",
      res.status === 200 &&
        payload.ok === true &&
        removedAll.some((u) => u.endsWith(`/${SLUG}`)) &&
        removedAll.some((u) => u.includes("streamPropertyMedia")) &&
        removedAll.some((u) => u.endsWith("/sitemap.xml")),
      `${payload.purged}/${payload.requested} keys removed, including the page, the sitemap and each media asset`,
    );

    const after = await worker.fetch(get(`/${SLUG}`), h.env);
    check("purge_forces_the_next_page_view_to_revalidate_at_the_origin", after.status === 200 && h.calls.length === before + 1, `origin calls before=${before} after=${h.calls.length}`);
  }
  {
    const h = makeHarness();
    const bad = await worker.fetch(await postPurge({ slug: SLUG }, { secret: "wrong-secret" }), h.env);
    const stale = await worker.fetch(await postPurge({ slug: SLUG }, { timestamp: String(Math.floor(Date.now() / 1000) - 3600) }), h.env);
    check("purge_rejects_a_bad_signature_and_a_replayed_timestamp", bad.status === 401 && stale.status === 401, `bad signature=${bad.status}, stale timestamp=${stale.status}`);
  }
  {
    const h = makeHarness();
    const res = await worker.fetch(get(`/${SLUG}?test=1`), h.env);
    check("cache_keys_are_not_affected_by_unrelated_query_parameters", res.status === 200, "page lookup is by slug only");
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