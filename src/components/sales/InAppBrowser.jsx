import React, { useState, useEffect } from "react";
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

  useEffect(() => {
    setLoading(true);
    setForced(null);
    setForceError("");
  }, [url]);

  const forceLoad = async () => {
    setForcing(true);
    setForceError("");
    try {
      const res = await base44.functions.invoke("proxyEmbed", { url });
      const data = res.data || {};
      if (data.error) throw new Error(data.error);
      setForced({ html: data.html });
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
        {loading && !forced && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#B8956A" }} />
            <p className="mt-2 text-xs" style={{ color: "rgba(26,26,26,0.55)" }}>Loading website…</p>
          </div>
        )}
        {forcing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-20">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#B8956A" }} />
            <p className="mt-2 text-xs" style={{ color: "rgba(26,26,26,0.55)" }}>Force-loading this site…</p>
          </div>
        )}
        {forced ? (
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
            onLoad={() => setLoading(false)}
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