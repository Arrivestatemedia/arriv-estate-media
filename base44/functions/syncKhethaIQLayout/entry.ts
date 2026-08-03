// syncKhethaIQLayout/entry.ts
// Fetches the central KhethaIQ app's full UI structure (navigation tabs, brand config,
// logo) from its compiled JS bundle and stores it in AppSetting so the Estate Media
// KhethaIQ page renders an exact mirror (minus colors).
//
// Extracts from the central app's minified JS:
//   - IN_APP_NAVIGATION array (tab key, label, view, icon)
//   - KHETHAIQ_BRAND object (product_name, tagline, logo_url, navigation_labels)
//
// The manifest is stored in AppSetting under "khethaiq_manifest_cache" so the
// frontend's getKhethaIQManifest function picks it up immediately.
//
// Scheduled to run 3x daily (7am, 2pm, 9:30pm) via scheduled automations.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

const CACHE_KEY = "khethaiq_manifest_cache";

// Extract the JS bundle URL from the central app's HTML
function extractJsBundleUrl(html, origin) {
  // Look for <script type="module" src="/assets/index-XXXX.js">
  const match = html.match(/<script[^>]+src=["'](\/assets\/index-[^"']+\.js)["']/);
  if (match) return origin + match[1];
  // Fallback: any script src
  const fallback = html.match(/<script[^>]+src=["']([^"']+\.js)["']/);
  if (fallback) return fallback[1].startsWith("http") ? fallback[1] : origin + fallback[1];
  return null;
}

// Extract a balanced bracket/brace section starting at `startMarker` in `js`.
// `open` and `close` are the bracket characters (e.g. "[" and "]" or "{" and "}").
function extractBalanced(js, startMarker, open, close) {
  const startIdx = js.indexOf(startMarker);
  if (startIdx < 0) return null;
  const openIdx = js.indexOf(open, startIdx + startMarker.length);
  if (openIdx < 0) return null;
  let depth = 0;
  let i = openIdx;
  let inString = false;
  let stringChar = "";
  while (i < js.length) {
    const ch = js[i];
    if (inString) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === stringChar) inString = false;
    } else {
      if (ch === '"' || ch === "'") { inString = true; stringChar = ch; }
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return js.substring(openIdx, i + 1);
      }
    }
    i++;
  }
  return null;
}

// Parse a JS object literal like {key:"value"} into a JSON object
function parseJsObject(text) {
  if (!text) return null;
  // Quote unquoted keys: match word: at the start or after , or {
  const jsonish = text
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')
    // Remove trailing commas before } or ]
    .replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(jsonish);
  } catch {
    return null;
  }
}

// Parse a JS array of objects like [{key:"val",...},...] into a JSON array
function parseJsArray(text) {
  if (!text) return null;
  const inner = text.replace(/^\[/, "").replace(/\]$/, "");
  // Split on },{ but keep the braces
  const objects = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === stringChar) inString = false;
    } else {
      if (ch === '"' || ch === "'") { inString = true; stringChar = ch; }
      else if (ch === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const obj = parseJsObject(inner.substring(start, i + 1));
          if (obj) objects.push(obj);
        }
      }
    }
  }
  return objects;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const appUrl = secrets.get("KHETHAIQ_APP_URL");

    if (!appUrl) {
      return Response.json({ error: "KHETHAIQ_APP_URL not set" }, { status: 500 });
    }

    const origin = new URL(appUrl).origin;

    // 1. Fetch the central app's HTML to find the JS bundle URL
    const htmlRes = await fetch(appUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!htmlRes.ok) {
      return Response.json({ error: "Failed to fetch central app HTML" }, { status: 502 });
    }

    const html = await htmlRes.text();
    const jsUrl = extractJsBundleUrl(html, origin);

    if (!jsUrl) {
      return Response.json({ error: "Could not find JS bundle URL in HTML" }, { status: 502 });
    }

    // 2. Fetch the JS bundle
    const jsRes = await fetch(jsUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!jsRes.ok) {
      return Response.json({ error: "Failed to fetch JS bundle" }, { status: 502 });
    }

    const js = await jsRes.text();

    // 3. Extract IN_APP_NAVIGATION array
    const navText = extractBalanced(js, "IN_APP_NAVIGATION=", "[", "]");
    const tabs = parseJsArray(navText) || [];

    // 4. Extract KHETHAIQ_BRAND object
    const brandText = extractBalanced(js, "KHETHAIQ_BRAND=", "{", "}");
    const brand = parseJsObject(brandText) || {};

    // 5. Build the manifest
    const manifest = {
      title: brand.footer_legal_name || "Khetha IQ by Arriv",
      product_name: brand.product_name || "Khetha IQ",
      tagline: brand.tagline || "Hiring Intelligence",
      logo_url: brand.logo_url || null,
      navigation_labels: brand.navigation_labels || {},
      tabs: tabs.map(t => ({
        id: t.key,
        label: t.label,
        view: t.view,
        icon: t.icon,
      })),
      source: "live_sync",
      synced_at: new Date().toISOString(),
    };

    // 6. Store in AppSetting (overwrite the manifest cache)
    const cacheEntry = {
      manifest,
      cached_at: new Date().toISOString(),
    };

    try {
      const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: CACHE_KEY });
      if (existing?.length > 0) {
        await base44.asServiceRole.entities.AppSetting.update(
          existing[0].id,
          { value: JSON.stringify(cacheEntry) }
        );
      } else {
        await base44.asServiceRole.entities.AppSetting.create({
          key: CACHE_KEY,
          value: JSON.stringify(cacheEntry),
        });
      }
    } catch (e) {
      // Non-fatal — the manifest is still returned
    }

    return Response.json({
      status: "synced",
      tabs_count: tabs.length,
      brand_extracted: !!brand.product_name,
      logo_url: manifest.logo_url,
      synced_at: manifest.synced_at,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}