import React, { useState } from "react";
import { Minus, Maximize2, Minimize2, X, Loader2, Globe, ExternalLink } from "lucide-react";

/**
 * In-app browser window for viewing a realtor's website.
 * Modes:
 *   - "inTab": rendered within the prospecting tab flow (large inline window)
 *   - "fullPage": fixed inset-0 overlay taking over the whole app
 * Controls:
 *   - Minimize → onMinimize (closes back to prospecting tab)
 *   - Close (x) → onClose (closes back to prospecting tab)
 *   - Full page → toggles between inTab and fullPage
 */
export default function InAppBrowser({ url, mode, onMinimize, onClose, onToggleFull }) {
  const [loading, setLoading] = useState(true);
  const isFull = mode === "fullPage";

  const containerClass = isFull
    ? "fixed inset-0 z-[9999] flex flex-col bg-white"
    : "relative w-full rounded-xl border shadow-lg flex flex-col overflow-hidden bg-white";
  const containerStyle = isFull
    ? {}
    : { borderColor: "rgba(184,149,106,0.35)", height: "75vh" };

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0 select-none"
        style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}
      >
        <Globe className="w-4 h-4 flex-shrink-0" style={{ color: "#B8956A" }} />
        <div
          className="flex-1 min-w-0 truncate text-xs font-medium px-2 py-1 rounded-md"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
          title={url}
        >
          {url}
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onMinimize}
            title="Minimize"
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleFull}
            title={isFull ? "Restore to prospecting tab" : "Full page"}
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            {isFull ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-red-500/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Browser body */}
      <div className="relative flex-1 min-h-0 bg-white">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#B8956A" }} />
            <p className="mt-2 text-xs" style={{ color: "rgba(26,26,26,0.55)" }}>Loading website…</p>
          </div>
        )}
        <iframe
          src={url}
          title="Realtor website"
          className="w-full h-full border-0"
          onLoad={() => setLoading(false)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
        />
        {/* Fallback hint if a site blocks embedding */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
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
      </div>
    </div>
  );
}