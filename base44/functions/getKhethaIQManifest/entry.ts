// getKhethaIQManifest/entry.ts
// Fetches the UI manifest (tabs, logo, title) from the central KhethaIQ app
// so Arriv Estate Media can render a local mirror that stays in sync.
//
// The central app is a Base44 SPA — it doesn't expose a JSON manifest endpoint,
// so this function fetches the central app's landing page HTML and extracts
// the logo URL from the rendered <img> tags. The tab list is maintained as a
// local default that mirrors the central app's sidebar (updated to match the
// central app's dashboard as of 2026-08-03).
//
// The manifest is cached in AppSetting (1 hour TTL) to avoid hitting the
// central app on every page load.
//
// Manifest shape:
//   {
//     title: "Khetha IQ by Arriv",
//     logo_url: "https://...",
//     tabs: [{ id, label, icon }],
//     source: "live" | "cache" | "stale_cache" | "local_default",
//     updated_at: ISO string
//   }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

const CACHE_KEY = "khethaiq_manifest_cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Fallback tab list mirroring the central KhethaIQ app's sidebar (14 tabs).
// Updated to match the live canonical app's IN_APP_NAVIGATION as extracted by
// syncKhethaIQLayout. The live-synced tabs (stored in AppSetting cache) are
// preferred at runtime; this list is only used when no cache exists.
// Icons are lucide-react component names.
const CENTRAL_TABS = [
  { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { id: "ask_khetha", label: "Ask Khetha", icon: "Sparkles" },
  { id: "jobs", label: "Jobs", icon: "Briefcase" },
  { id: "candidates", label: "Candidates", icon: "Users" },
  { id: "talent_search", label: "Talent Search", icon: "Search" },
  { id: "talent_pools", label: "Talent Pools", icon: "Users" },
  { id: "pipeline", label: "Pipeline", icon: "GitBranch" },
  { id: "interviews", label: "Interviews", icon: "Video" },
  { id: "offers", label: "Offers", icon: "FileText" },
  { id: "tasks", label: "Tasks", icon: "SquareCheckBig" },
  { id: "applications", label: "Applications", icon: "FileText" },
  { id: "portal", label: "Applicant Portal", icon: "Search" },
  { id: "learning", label: "Learning", icon: "Brain" },
  { id: "analytics", label: "Analytics", icon: "BarChart3" },
];

const LOCAL_DEFAULT = {
  title: "Khetha IQ by Arriv",
  logo_url:
    "https://media.base44.com/images/public/6a6f886916fd2b95386a3adc/4a507fa47_ChatGPTImageAug2202603_15_57PM.png",
  tabs: CENTRAL_TABS,
  updated_at: new Date().toISOString(),
};

// Extract the first <img src="..."> URL from HTML that looks like a logo
// (contains "khetha" or "arriv" in the URL, or is from media.base44.com).
function extractLogoFromHtml(html) {
  if (!html) return null;
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const url = match[1];
    if (
      url.includes("media.base44.com") ||
      url.includes("khetha") ||
      url.includes("arriv") ||
      url.includes("ArrivLogo")
    ) {
      return url;
    }
  }
  // Fallback: return the first img src found
  const firstMatch = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return firstMatch ? firstMatch[1] : null;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Read cached manifest
    let cached = null;
    try {
      const settings = await base44.asServiceRole.entities.AppSetting.filter({
        key: CACHE_KEY,
      });
      if (Array.isArray(settings) && settings.length > 0) {
        cached = JSON.parse(settings[0].value);
      }
    } catch (_) {}

    // Return fresh cache immediately
    if (
      cached?.cached_at &&
      Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL_MS
    ) {
      return Response.json({ ...cached.manifest, source: "cache" });
    }

    // Fetch the central KhethaIQ app's landing page to extract the logo
    const appUrl = secrets.get("KHETHAIQ_APP_URL");

    if (appUrl) {
      try {
        const res = await fetch(appUrl, {
          headers: {
            Accept: "text/html",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const html = await res.text();
          const logoUrl = extractLogoFromHtml(html);

          // Build the manifest: prefer the live-synced tabs from cache (populated
          // by syncKhethaIQLayout, which extracts IN_APP_NAVIGATION from the
          // central app's compiled JS bundle). Only fall back to CENTRAL_TABS
          // when the cache has no synced tabs. The logo URL is preserved from
          // the live fetch, then cache, then local default.
          const cachedTabs = Array.isArray(cached?.manifest?.tabs) && cached.manifest.tabs.length > 0
            ? cached.manifest.tabs
            : null;
          const manifest = {
            title: cached?.manifest?.title || LOCAL_DEFAULT.title,
            tabs: cachedTabs || CENTRAL_TABS,
            logo_url: logoUrl || (cached?.manifest?.logo_url) || LOCAL_DEFAULT.logo_url,
            updated_at: new Date().toISOString(),
          };

          // Persist cache
          const cacheEntry = {
            manifest,
            cached_at: new Date().toISOString(),
          };
          try {
            const existing = await base44.asServiceRole.entities.AppSetting.filter({
              key: CACHE_KEY,
            });
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
          } catch (_) {}

          return Response.json({ ...manifest, source: "live" });
        }
      } catch (_) {}
    }

    // Fall back to stale cache, then local default
    if (cached?.manifest) {
      return Response.json({ ...cached.manifest, source: "stale_cache" });
    }
    return Response.json({ ...LOCAL_DEFAULT, source: "local_default" });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}