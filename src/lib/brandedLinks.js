import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

/**
 * File links on Arriv's own domain.
 *
 * A Base44-hosted file address is replaced by `<our domain>/r/<code>`, which the
 * /r/<code> route opens on the branded page. The domain is taken from wherever
 * the app is being served, so the link always matches the address the visitor is
 * already on. Resolved codes are cached, so the swap is instant after first use.
 */

const CACHE_KEY = "arriv_branded_file_links_v1";
const PLATFORM_HOST = /(^|\.)base44\.com$|(^|\.)base44\.app$|(^|\.)supabase\.co$/i;

const cache = new Map();
if (typeof window !== "undefined") {
  try {
    Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) || "{}")).forEach(([url, code]) => {
      if (typeof code === "string") cache.set(url, code);
    });
  } catch {
    /* no cached links */
  }
}

function persist() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    /* storage unavailable */
  }
}

/** True when the address points at a Base44-hosted file rather than our own domain. */
export function isPlatformFileUrl(url) {
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "arrivestatemedia.com" || host.endsWith(".arrivestatemedia.com")) return false;
    return PLATFORM_HOST.test(host);
  } catch {
    return false;
  }
}

export function brandedUrl(code, { download = false } = {}) {
  return `${window.location.origin}/r/${code}${download ? "?dl=1" : ""}`;
}

/** Branded links for several addresses in one call. Non-platform addresses are returned as-is. */
export async function getBrandedUrls(urls) {
  const supplied = [...new Set((urls || []).filter(Boolean))];
  const out = {};
  const missing = [];

  supplied.forEach((url) => {
    if (!isPlatformFileUrl(url)) {
      out[url] = url;
    } else if (cache.has(url)) {
      out[url] = brandedUrl(cache.get(url));
    } else {
      missing.push(url);
    }
  });

  if (missing.length) {
    const res = await base44.functions.invoke("getBrandedFileLinks", { urls: missing });
    const links = res?.data?.links || res?.links || {};
    Object.entries(links).forEach(([url, link]) => {
      const code = typeof link === "string" ? link.split("/r/").pop() : link?.code;
      if (!code) return;
      cache.set(url, code);
      out[url] = brandedUrl(code);
    });
    persist();
  }

  return out;
}

export async function getBrandedUrl(url, options) {
  if (!url) return "";
  if (!isPlatformFileUrl(url)) return url;
  if (cache.has(url)) return brandedUrl(cache.get(url), options);
  const map = await getBrandedUrls([url]);
  const code = cache.get(url);
  return code ? brandedUrl(code, options) : map[url] || url;
}

/**
 * The branded address for a file. Empty while it is being resolved, so a Base44
 * address is never rendered or clicked in the meantime.
 */
export function useBrandedFileUrl(url, { download = false } = {}) {
  const [resolved, setResolved] = useState(() => {
    if (!url) return "";
    if (!isPlatformFileUrl(url)) return url;
    return cache.has(url) ? brandedUrl(cache.get(url), { download }) : "";
  });

  useEffect(() => {
    let cancelled = false;

    if (!url) {
      setResolved("");
      return;
    }
    if (!isPlatformFileUrl(url)) {
      setResolved(url);
      return;
    }
    if (cache.has(url)) {
      setResolved(brandedUrl(cache.get(url), { download }));
      return;
    }

    setResolved("");
    getBrandedUrl(url).then((branded) => {
      if (cancelled) return;
      const code = cache.get(url);
      setResolved(code ? brandedUrl(code, { download }) : branded);
    });
    return () => {
      cancelled = true;
    };
  }, [url, download]);

  return resolved;
}