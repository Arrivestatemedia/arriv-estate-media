// getKhethaIQManifest/entry.ts
// Fetches the UI manifest (tabs, logo, title, style tokens) from the central
// KhethaIQ application so Arriv Estate Media can render a local mirror that
// stays in sync with the main app's structure while keeping Estate Media's
// color palette.
//
// The manifest is cached in AppSetting (1 hour TTL) to avoid hitting the
// KhethaIQ API on every page load. If the API endpoint is not yet available
// (or the request fails), the function falls back to the cached manifest
// (even if stale) and then to a local default that matches the current
// Estate Media KhethaIQ layout.
//
// Manifest shape:
//   {
//     title: "Khetha IQ",
//     logo_url: "https://...",
//     tabs: [{ id, label, icon }],
//     style: { title_font, card_radius, ... },
//     source: "live" | "cache" | "stale_cache" | "local_default",
//     updated_at: ISO string
//   }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

const CACHE_KEY = "khethaiq_manifest_cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const LOCAL_DEFAULT = {
  title: "Khetha IQ",
  logo_url:
    "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png",
  tabs: [
    { id: "jobs", label: "Jobs", icon: "Briefcase" },
    { id: "applications", label: "Applications", icon: "FileText" },
    { id: "portal", label: "Applicant Portal", icon: "Search" },
    { id: "learning", label: "Learning", icon: "Brain" },
    { id: "analytics", label: "Analytics", icon: "BarChart3" },
    { id: "recruiting", label: "Recruiting", icon: "Radar" },
    { id: "ask_khetha", label: "Ask Khetha", icon: "Sparkles" },
  ],
  style: {
    title_font: "Georgia, 'Times New Roman', serif",
    card_radius: "14px",
  },
  updated_at: new Date().toISOString(),
};

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

    // Try to fetch a live manifest from the central KhethaIQ app
    const appUrl = secrets.get("KHETHAIQ_APP_URL");
    const apiKey = secrets.get("KHETHAIQ_API_KEY");

    if (appUrl && apiKey) {
      try {
        const manifestUrl = appUrl.replace(/\/$/, "") + "/api/manifest";
        const res = await fetch(manifestUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const manifest = await res.json();
          const cacheEntry = {
            manifest,
            cached_at: new Date().toISOString(),
          };
          // Persist cache
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