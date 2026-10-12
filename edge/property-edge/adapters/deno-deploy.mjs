// Deno Deploy adapter for the Arriv property edge worker.
//
// WHY THIS EXISTS: arrivestatemedia.com keeps its nameservers at Squarespace, so the production
// subdomain cannot be bound to a Cloudflare Worker (that needs the zone on Cloudflare). Deno
// Deploy serves a custom hostname from a single CNAME with automatic TLS, and the worker itself
// needs no changes — it only needs the environment passed in.
//
// Deploy: point Deno Deploy at edge/property-edge/adapters/deno-deploy.mjs, set the same
// variables (ORIGIN_BASE, PUBLIC_HOST, PROPERTY_EDGE_DISABLED, *_TTL_SECONDS) and the
// PURGE_SECRET secret, then add the custom domain `properties.arrivestatemedia.com` in the Deno
// Deploy dashboard and the matching CNAME at Squarespace.
//
// The same five lines adapt the worker to Vercel Edge or Netlify Edge; ask if you want either.

import worker from "../worker.mjs";

const ENV_KEYS = [
  "ORIGIN_BASE",
  "PUBLIC_HOST",
  "PROPERTY_EDGE_DISABLED",
  "HTML_TTL_SECONDS",
  "MEDIA_TTL_SECONDS",
  "SITEMAP_TTL_SECONDS",
  "NOT_FOUND_TTL_SECONDS",
  "PURGE_SECRET",
];

export default {
  fetch(request) {
    const env = {};
    for (const key of ENV_KEYS) env[key] = Deno.env.get(key) ?? "";
    return worker.fetch(request, env);
  },
};