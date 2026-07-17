import React, { useState, useEffect, useRef } from "react";
import { Minus, Maximize2, Minimize2, X, Loader2, Globe, ExternalLink, ArrowLeft, ArrowRight, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";

/**
 * In-app browser window for viewing a realtor's website / a listing page.
 * Modes:
 *   - "inTab": rendered within the prospecting tab flow (inline window replacing the card)
 *   - "fullPage": fixed inset-0 overlay taking over the whole app
 * Controls:
 *   - Back / Forward — navigate the in-app history (listings <-> listing page <-> website)
 *   - Minimize → onMinimize (closes back to prospecting tab)
 *   - Close (x) → onClose
 *   - Full page → toggles between inTab and fullPage
 *   - Force load — re-fetches the page through a header-stripping proxy so sites
 *     that block embedding (X-Frame-Options / CSP) can still render.
 */
export default function InAppBrowser({ url, mode, onMinimize, onClose, onToggleFull, onBack, onForward, canBack, canForward }) {
  const [loading, setLoading] = useState(true);
  const [forced, setForced] = useState(null); // { html } when loaded through the proxy
  const [forcing, setForcing] = useState(false);
  const [forceError, setForceError] = useState("");
  const [loadStart, setLoadStart] = useState(0);
  const [openedExternally, setOpenedExternally] = useState(false);
  const [blocked, setBlocked] = useState(false); // iframe never fired onLoad → likely blocks framing
  const embedTimeoutRef = useRef(null);

  // Per-URL cache of previously fetched results so Back/Forward return instantly
  // without re-fetching or re-running block detection. Entries:
  //   { forced: {html} }            — proxy-forced HTML, render via srcDoc
  //   { openedExternally: true }    — site was auto-opened in the browser
  //   { loaded: true }              — direct iframe load succeeded (browser cache serves it)
  const cacheRef = useRef({});

  // Real-estate portals known to send X-Frame-Options / CSP frame-ancestors that
  // prevent embedding. Timing-based detection alone is unreliable for these (the
  // block response still requires a network round-trip), so we hard-shortcut them.
  const BLOCKED_HOSTS = [
    "zillow.com", "realtor.com", "redfin.com", "trulia.com", "homes.com",
    "century21.com", "kw.com", "kellerwilliams.com", "remax.com",
    "coldwellbanker.com", "compass.com", "estately.com", "movoto.com",
    "opendoor.com", "homesnap.com", "har.com", "fidelitynationalhome warranty.com",
    "homesforsale.com", "buyowner.com", "for-sale-byowner.com", "landwatch.com",
    "loopnet.com", "apartments.com", "apartmentlist.com", "rent.com",
    "realtor.org", "brightmls.com", "primeMLS.com", "flexmls.com",
    "paragonfmls.com", " matrixmls.com", "mls.com",
  ];

  const isKnownBlocked = (rawUrl) => {
    try {
      const host = (new URL(rawUrl)).hostname.toLowerCase();
      return BLOCKED_HOSTS.some((h) => host === h || host.endsWith("." + h));
    } catch { return false; }
  };

  const openExternally = (target) => {
    const win = window.open(target, "_blank", "noopener,noreferrer");
    setOpenedExternally(true);
    setLoading(false);
    cacheRef.current[target] = { openedExternally: true };
    if (!win) setForceError("Popup blocked — tap below to open the website.");
  };

  useEffect(() => {
    // Reuse a cached result instantly on Back/Forward — no refetch, no spinner,
    // no re-running of the block-detection timing heuristic.
    const cached = cacheRef.current[url];
    if (cached) {
      setForced(cached.forced || null);
      setOpenedExternally(!!cached.openedExternally);
      setBlocked(!!cached.blocked);
      setForceError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setForced(null);
    setForceError("");
    setOpenedExternally(false);
    setBlocked(false);
    // Known-blocking portals: skip the iframe entirely and open in the browser.
    if (isKnownBlocked(url)) {
      openExternally(url);
      return;
    }
    setLoadStart(Date.now());
    // Safety net: if the iframe's onLoad never fires (many listing pages block
    // framing silently and the load event is simply never emitted), stop
    // showing the spinner after a few seconds and offer open/force-load instead
    // of hanging on "Loading website…" forever.
    if (embedTimeoutRef.current) clearTimeout(embedTimeoutRef.current);
    embedTimeoutRef.current = setTimeout(() => {
      setLoading(false);
      setBlocked(true);
      cacheRef.current[url] = { blocked: true };
    }, 7000);
    return () => {
      if (embedTimeoutRef.current) { clearTimeout(embedTimeoutRef.current); embedTimeoutRef.current = null; }
    };
  }, [url]);

  const handleDirectLoad = () => {
    if (embedTimeoutRef.current) { clearTimeout(embedTimeoutRef.current); embedTimeoutRef.current = null; }
    // Already served from cache — nothing to detect.
    if (cacheRef.current[url]?.loaded) return;
    // For unknown sites: blocked iframes render the browser's "refused to connect"
    // error page, which loads far faster than a real page (no document to parse).
    // Treat a sub-1200ms load as blocked; real embedded pages take longer to
    // fetch + parse + render even on a fast connection.
    const elapsed = Date.now() - loadStart;
    if (elapsed < 1200) {
      openExternally(url);
    } else {
      cacheRef.current[url] = { loaded: true };
      setBlocked(false);
      setLoading(false);
    }
  };

  const forceLoad = async () => {
    if (embedTimeoutRef.current) { clearTimeout(embedTimeoutRef.current); embedTimeoutRef.current = null; }
    setForcing(true);
    setBlocked(false);
    setForceError("");
    try {
      const res = await base44.functions.invoke("proxyEmbed", { url });
      const data = res.data || {};
      if (data.error) throw new Error(data.error);
      setForced({ html: data.html });
      cacheRef.current[url] = { forced: { html: data.html } };
      setLoading(false);
    } catch (e) {
      setForceError(e?.message || "Could not force-load this site");
    } finally {
      setForcing(false);
    }
  };

  const isFull = mode === "fullPage";
  const containerClass = isFull
    ? "fixed inset-0 z-[9999] flex flex-col bg-white"
    : "relative w-full rounded-xl border shadow-lg flex flex-col overflow-hidden bg-white";
  const containerStyle = isFull ? {} : { borderColor: "rgba(184,149,106,0.35)", height: "75vh" };

  const navBtn = (onClick, disabled, icon, title) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${disabled ? "opacity-30 cursor-default" : "hover:bg-white/10"}`}
    >
      {icon}
    </button>
  );

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Title bar */}
      <div
        className="flex items-center gap-1 px-3 py-2 flex-shrink-0 select-none"
        style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}
      >
        {navBtn(onBack, !canBack, <ArrowLeft className="w-4 h-4" />, "Back")}
        {navBtn(onForward, !canForward, <ArrowRight className="w-4 h-4" />, "Forward")}
        <Globe className="w-4 h-4 flex-shrink-0 ml-1" style={{ color: "#B8956A" }} />
        <div
          className="flex-1 min-w-0 truncate text-xs font-medium px-2 py-1 rounded-md"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
          title={url}
        >
          {url}
        </div>
        {/* Window controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {onMinimize && (
            <button onClick={onMinimize} title="Minimize" className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors">
              <Minus className="w-4 h-4" />
            </button>
          )}
          {onToggleFull && (
            <button onClick={onToggleFull} title={isFull ? "Restore to prospecting tab" : "Full page"} className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors">
              {isFull ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
          <button onClick={onClose} title="Close" className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-red-500/80 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Browser body */}
      <div className="relative flex-1 min-h-0 bg-white">
        {loading && !forced && !blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#B8956A" }} />
            <p className="mt-2 text-xs" style={{ color: "rgba(26,26,26,0.55)" }}>Loading website…</p>
          </div>
        )}
        {blocked && !forced && !openedExternally && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 text-center px-6">
            <Globe className="w-9 h-9" style={{ color: "#B8956A" }} />
            <p className="mt-3 text-sm font-medium" style={{ color: "#1A1A1A" }}>
              This site couldn't be embedded
            </p>
            <p className="mt-1 text-xs" style={{ color: "rgba(26,26,26,0.55)" }}>
              It likely blocks framing. Open it in a new tab or force-load it below.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full shadow-md hover:opacity-90"
                style={{ backgroundColor: "#B8956A", color: "#FFFBF5" }}
              >
                <ExternalLink className="w-3 h-3" /> Open in new tab
              </a>
              <button
                onClick={forceLoad}
                disabled={forcing}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full shadow-md hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: "rgba(184,149,106,0.95)", color: "#FFFBF5" }}
              >
                <Zap className="w-3 h-3" /> Force load
              </button>
            </div>
          </div>
        )}
        {forcing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-20">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#B8956A" }} />
            <p className="mt-2 text-xs" style={{ color: "rgba(26,26,26,0.55)" }}>Force-loading this site…</p>
          </div>
        )}
        {openedExternally ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 text-center px-6">
            <ExternalLink className="w-9 h-9" style={{ color: "#B8956A" }} />
            <p className="mt-3 text-sm font-medium" style={{ color: "#1A1A1A" }}>
              Website opened in browser window
            </p>
            <p className="mt-1 text-xs" style={{ color: "rgba(26,26,26,0.55)" }}>
              This site doesn't allow embedding, so it was opened in a new tab.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full shadow-md hover:opacity-90"
              style={{ backgroundColor: "#B8956A", color: "#FFFBF5" }}
            >
              <ExternalLink className="w-3 h-3" /> Open again
            </a>
          </div>
        ) : forced ? (
          <iframe
            srcDoc={forced.html}
            title="Realtor website (forced)"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        ) : (
          <iframe
            src={url}
            title="Realtor website"
            className="w-full h-full border-0"
            onLoad={handleDirectLoad}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
          />
        )}

        {/* Fallback / force controls */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex items-center gap-2">
          {!forced && (
            <button
              onClick={forceLoad}
              disabled={forcing}
              className="pointer-events-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full shadow-md hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "rgba(184,149,106,0.95)", color: "#FFFBF5" }}
              title="Some sites block embedding — re-load through our proxy"
            >
              <Zap className="w-3 h-3" /> Force load
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full shadow-md hover:underline"
            style={{ backgroundColor: "rgba(26,26,26,0.85)", color: "#FFFBF5" }}
          >
            <ExternalLink className="w-3 h-3" /> Open in new tab
          </a>
        </div>
        {forceError && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 pointer-events-auto text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "rgba(185,28,28,0.9)", color: "#FFFBF5" }}>
            {forceError}
          </div>
        )}
      </div>
    </div>
  );
}