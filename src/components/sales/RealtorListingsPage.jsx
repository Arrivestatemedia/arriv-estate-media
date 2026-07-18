import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Minus, Maximize2, Minimize2, X, Loader2, MapPin, Tag, ExternalLink, Home, ArrowLeft, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * In-app "browser" window showing a realtor's other listings — visually and
 * behaviorally identical to the InAppBrowser (inTab inline / fullPage overlay),
 * just with a listings list as the body instead of an iframe. Clicking a
 * listing's "View listing" opens that exact listing URL in the same in-app
 * browser via onOpenListing (instead of leaving the app).
 */
export default function RealtorListingsPage({
  realtor,
  salesMemberId,
  locationLabel,
  lat,
  lng,
  mode = "inTab",
  onMinimize,
  onClose,
  onToggleFull,
  onOpenListing,
  onBack,
  onForward,
  canBack,
  canForward,
  cachedListings,
  onCacheListings,
}) {
  const [listings, setListings] = useState(Array.isArray(cachedListings) ? cachedListings : []);
  const [loading, setLoading] = useState(!Array.isArray(cachedListings) || cachedListings.length === 0);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Restore cached listings instantly on remount (e.g. when navigating back
    // from an opened listing) — no re-fetch, no "Searching…" spinner.
    if (Array.isArray(cachedListings) && cachedListings.length > 0) {
      setListings(cachedListings);
      setLoading(false);
      setError("");
      setNoMore(false);
      return;
    }
    let active = true;
    let timer = null;
    if (!Array.isArray(cachedListings) || cachedListings.length === 0) {
      const start = Date.now();
      timer = setInterval(() => {
        if (!active) return;
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    }
    (async () => {
      setLoading(true);
      setError("");
      setListings([]);
      setNoMore(false);
      setElapsed(0);
      try {
        const res = await base44.functions.invoke("findRealtorListings", {
          salesMemberId,
          name: realtor?.name,
          brokerage: realtor?.brokerage || "",
          locationLabel: locationLabel || "",
          lat,
          lng,
        });
        if (!active) return;
        const data = res.data || {};
        if (data.error) setError(data.error);
        const fetched = Array.isArray(data.listings) ? data.listings : [];
        setListings(fetched);
        if (onCacheListings) onCacheListings(fetched);
      } catch (e) {
        if (active) setError(e?.message || "Failed to load listings");
      } finally {
        if (active) setLoading(false);
        if (timer) clearInterval(timer);
      }
    })();
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [realtor?.name, realtor?.brokerage]);

  const loadMore = async () => {
    if (loadingMore || noMore) return;
    setLoadingMore(true);
    try {
      const existing = listings.map((l) => l.listing_address).filter(Boolean);
      const res = await base44.functions.invoke("findRealtorListings", {
        salesMemberId,
        name: realtor?.name,
        brokerage: realtor?.brokerage || "",
        locationLabel: locationLabel || "",
        lat,
        lng,
        exclude: existing,
        limit: 2,
      });
      const data = res.data || {};
      const more = Array.isArray(data.listings) ? data.listings : [];
      // dedupe by address (case-insensitive)
      const seen = new Set(listings.map((l) => (l.listing_address || "").toLowerCase()));
      const fresh = more.filter((l) => {
        const k = (l.listing_address || "").toLowerCase();
        return k && !seen.has(k) && !seen.has(k + (l.listing_url || ""));
      });
      if (fresh.length === 0) setNoMore(true);
      setListings((prev) => [...prev, ...fresh]);
    } catch (e) {
      setError(e?.message || "Failed to load more listings");
    } finally {
      setLoadingMore(false);
    }
  };

  const isFull = mode === "fullPage";
  const containerClass = isFull
    ? "fixed inset-0 z-[9999] flex flex-col bg-white"
    : "relative w-full rounded-xl border shadow-lg flex flex-col overflow-hidden bg-white";
  const containerStyle = isFull
    ? {}
    : { borderColor: "rgba(184,149,106,0.35)", height: "75vh" };

  const title = `${realtor?.name || "Agent"} — Other Listings${
    realtor?.brokerage ? ` · ${realtor.brokerage}` : ""
  }`;

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Title bar — matches the in-app website browser */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0 select-none"
        style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}
      >
        <button
          onClick={onBack}
          disabled={!canBack}
          title="Back"
          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${!canBack ? "opacity-30 cursor-default" : "hover:bg-white/10"}`}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onForward}
          disabled={!canForward}
          title="Forward"
          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${!canForward ? "opacity-30 cursor-default" : "hover:bg-white/10"}`}
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <Home className="w-4 h-4 flex-shrink-0 ml-1" style={{ color: "#B8956A" }} />
        <div
          className="flex-1 min-w-0 truncate text-xs font-medium px-2 py-1 rounded-md"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
          title={title}
        >
          {title}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onMinimize && (
            <button
              onClick={onMinimize}
              title="Minimize"
              className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
          )}
          {onToggleFull && (
            <button
              onClick={onToggleFull}
              title={isFull ? "Restore to prospecting tab" : "Full page"}
              className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              {isFull ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={onClose}
            title="Close"
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-red-500/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 min-h-0 overflow-y-auto p-4" style={{ backgroundColor: "#FFFBF5" }}>
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#B8956A" }} />
            <p className="text-xs" style={{ color: "rgba(26,26,26,0.55)" }}>
              Searching the web for this agent's listings…
            </p>
            {elapsed > 0 && (
              <p className="text-[11px]" style={{ color: "rgba(26,26,26,0.4)" }}>
                {elapsed}s — this scans live listing sites, so it can take ~30–45s
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600 text-center py-12">{error}</p>}

        {!loading && !error && listings.length === 0 && (
          <div className="text-center py-16">
            <Home className="w-10 h-10 mx-auto opacity-30" />
            <p className="mt-3 text-sm" style={{ color: "rgba(26,26,26,0.6)" }}>
              No other listings found for this agent.
            </p>
          </div>
        )}

        {!loading && listings.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: "rgba(26,26,26,0.5)" }}>
              {listings.length} listing{listings.length !== 1 ? "s" : ""} found
            </p>
            {listings.map((l, li) => {
              const specs = [
                l.beds != null && `${l.beds} bd`,
                l.baths != null && `${l.baths} ba`,
                l.sqft != null && `${Number(l.sqft).toLocaleString()} sqft`,
              ].filter(Boolean);
              return (
              <div
                key={li}
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: "rgba(184,149,106,0.25)", backgroundColor: "#FFFFFF" }}
              >
                <div className="flex">
                  {l.photo_url ? (
                    <img
                      src={l.photo_url}
                      alt=""
                      className="w-24 h-24 object-cover flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <div
                      className="w-24 h-24 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "rgba(184,149,106,0.08)" }}
                    >
                      <Home className="w-8 h-8 opacity-30" style={{ color: "#B8956A" }} />
                    </div>
                  )}
                  <div className="p-3 flex-1 min-w-0">
                    <p
                      className="text-sm font-medium flex items-start gap-1.5"
                      style={{ color: "#1A1A1A" }}
                    >
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#B8956A" }} />
                      <span className="truncate">{l.listing_address || "Address unavailable"}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {l.listing_status && (
                        <Badge variant="outline" className="text-xs">{l.listing_status}</Badge>
                      )}
                      {l.price && l.price !== "Unknown" && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Tag className="w-3 h-3" />{l.price}
                        </Badge>
                      )}
                      {l.property_type && (
                        <Badge variant="outline" className="text-xs">{l.property_type}</Badge>
                      )}
                      {typeof l.has_professional_media === "boolean" && (
                        <Badge
                          className="text-xs"
                          style={{
                            backgroundColor: l.has_professional_media ? "#dcfce7" : "#fee2e2",
                            color: l.has_professional_media ? "#15803d" : "#b91c1c",
                          }}
                        >
                          {l.has_professional_media ? "Has pro media" : "Needs media"}
                        </Badge>
                      )}
                    </div>
                    {specs.length > 0 && (
                      <p className="mt-1.5 text-xs" style={{ color: "rgba(26,26,26,0.65)" }}>
                        {specs.join(" • ")}
                      </p>
                    )}
                    {l.description && (
                      <p className="mt-1 text-xs leading-snug line-clamp-2" style={{ color: "rgba(26,26,26,0.55)" }}>
                        {l.description}
                      </p>
                    )}
                    {(() => {
                      // A correct property-detail URL must contain this listing's
                      // street number (whole path token) + a street-name token.
                      // Reject generic city-search pages / wrong-property URLs (even
                      // from cached data) so "View listing" never opens the wrong home.
                      // STRICT: only a verified Zillow.com or Realtor.com property-DETAIL
                      // page whose path matches this listing's address opens as "View
                      // listing". Anything else falls back to a Google search. NO EXCEPTIONS.
                      const trustedDetail = (url, addr) => {
                        try {
                          const raw = String(url || "").trim();
                          if (!raw || raw.toLowerCase().includes("not found")) return false;
                          const u = raw.toLowerCase();
                          const host = new URL(raw).hostname.replace(/^www\./, "");
                          const isZillow = host === "zillow.com" || host.endsWith(".zillow.com");
                          const isRealtor = host === "realtor.com" || host.endsWith(".realtor.com");
                          if (!isZillow && !isRealtor) return false;
                          const path = new URL(raw).pathname.toLowerCase();
                          if (isZillow && !path.includes("/homedetails/")) return false;
                          if (isRealtor && !path.includes("/realestateandhomes-detail/")) return false;
                          const full = String(addr || "").toLowerCase();
                          const street = full.split(",")[0].trim();
                          const number = (street.match(/\d+/) || [])[0] || "";
                          const toks = street.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
                          const stateMatch = full.match(/,\s*([a-z]{2})\s+\d{5}/);
                          const state = stateMatch ? stateMatch[1] : "";
                          const zipMatch = full.match(/\b(\d{5})\b/);
                          const zip = zipMatch ? zipMatch[1] : "";
                          const pathTokens = u.split(/[^a-z0-9]+/).filter(Boolean);
                          const hasNumber = number && pathTokens.includes(number);
                          const hasName = toks.length === 0 ? true : toks.some((t) => pathTokens.some((pt) => pt.includes(t)));
                          const hasState = state && pathTokens.includes(state);
                          const hasZip = zip && pathTokens.includes(zip);
                          return !!(hasNumber && hasName && hasState && hasZip);
                        } catch { return false; }
                      };
                      const rawUrl = l.listing_url && String(l.listing_url).trim();
                      const direct = rawUrl && /^https?:\/\//i.test(rawUrl) && trustedDetail(rawUrl, l.listing_address) ? rawUrl : "";
                      // Fallback: when no valid Zillow/Realtor.com URL came back, link to a
                      // search for this address so the user can always find the property.
                      const fallback = !direct && l.listing_address
                        ? `https://www.google.com/search?q=${encodeURIComponent(
                            `${l.listing_address} ${realtor?.name || ""} ${realtor?.brokerage || ""} for sale zillow`
                          )}`
                        : "";
                      const href = direct || fallback;
                      if (!href) return null;
                      const label = direct ? "View listing" : "Search listing";
                      // Direct anchor (target=_blank): synchronous user-gesture
                      // navigation — never popup-blocked (the InAppBrowser's async
                      // window.open in a useEffect gets blocked for Zillow/Realtor.com).
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                          style={{ color: "#B8956A" }}
                        >
                          <ExternalLink className="w-3 h-3" /> {label}
                        </a>
                      );
                    })()}
                  </div>
                </div>
              </div>
              );
            })}
            {!loadingMore && !noMore && (
              <button
                onClick={loadMore}
                className="w-full mt-1 py-2 rounded-lg text-xs font-medium border transition-colors"
                style={{
                  borderColor: "rgba(184,149,106,0.4)",
                  color: "#B8956A",
                  backgroundColor: "rgba(184,149,106,0.05)",
                }}
              >
                Load more
              </button>
            )}
            {loadingMore && (
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#B8956A" }} />
                <span className="text-xs" style={{ color: "rgba(26,26,26,0.55)" }}>
                  Finding more listings…
                </span>
              </div>
            )}
            {noMore && (
              <p className="text-center text-xs py-2" style={{ color: "rgba(26,26,26,0.45)" }}>
                No more listings found for this agent.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}