import React, { useState, useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import KhethaIQFallback from "./KhethaIQFallback";

// Estate Media theme tokens — passed to the embedded KhethaIQ app via
// postMessage so it visually inherits the Arriv Estate Media color scheme.
const ESTATE_MEDIA_THEME = {
  light: {
    "--color-cream": "#FFFBF5",
    "--color-gold": "#B8956A",
    "--color-black": "#1A1A1A",
    "--bg-primary": "#FFFBF5",
    "--bg-secondary": "#FFFFFF",
    "--text-primary": "#1A1A1A",
    "--text-secondary": "rgba(26, 26, 26, 0.6)",
    "--accent-color": "#B8956A",
    "--accent-hover": "#A68559",
    "--border-color": "rgba(184, 149, 106, 0.2)",
    "--card-bg": "#FFFFFF",
  },
  dark: {
    "--color-cream": "#FFFBF5",
    "--color-gold": "#B8956A",
    "--color-black": "#1A1A1A",
    "--bg-primary": "#0A0A0A",
    "--bg-secondary": "#1A1A1A",
    "--text-primary": "#FFFBF5",
    "--text-secondary": "rgba(255, 251, 245, 0.6)",
    "--accent-color": "#B8956A",
    "--accent-hover": "#C9A87B",
    "--border-color": "rgba(184, 149, 106, 0.3)",
    "--card-bg": "#1A1A1A",
  },
};

const LOAD_TIMEOUT_MS = 15000;

export default function KhethaIQEmbed({ appUrl, ssoToken, userContext }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const iframeRef = useRef(null);
  const timeoutRef = useRef(null);

  const appOrigin = (() => {
    try { return new URL(appUrl).origin; } catch (_) { return appUrl; }
  })();

  const iframeSrc = `${appUrl}${appUrl.includes("?") ? "&" : "?"}sso_token=${encodeURIComponent(ssoToken)}&calling_application=ARRIV_ESTATE_MEDIA&embed=true`;

  const handleLoad = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoading(false);
    setError(false);
    // Send Estate Media context + theme to the iframe
    if (iframeRef.current?.contentWindow) {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      iframeRef.current.contentWindow.postMessage({
        type: "ESTATE_MEDIA_CONTEXT",
        context: {
          ...userContext,
          theme: prefersDark ? ESTATE_MEDIA_THEME.dark : ESTATE_MEDIA_THEME.light,
          color_scheme: prefersDark ? "dark" : "light",
        },
      }, appOrigin);
    }
  }, [appOrigin, ssoToken, userContext]);

  // Load timeout — show fallback if the iframe doesn't signal ready in time
  useEffect(() => {
    setLoading(true);
    setError(false);
    timeoutRef.current = setTimeout(() => {
      setError(true);
      setLoading(false);
    }, LOAD_TIMEOUT_MS);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [retryKey]);

  // Listen for postMessage from the iframe (ready / error signals)
  useEffect(() => {
    const handler = (event) => {
      if (event.origin !== appOrigin) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "KHETHAIQ_READY") {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLoading(false);
        setError(false);
      } else if (msg.type === "KHETHAIQ_ERROR") {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setError(true);
        setLoading(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [appOrigin]);

  const handleRetry = () => setRetryKey(k => k + 1);

  if (error) {
    return <KhethaIQFallback onRetry={handleRetry} />;
  }

  return (
    <div className="relative" style={{ minHeight: "calc(100vh - 64px)", background: "#FFFBF5" }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: "#FFFBF5" }}>
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: "#B8956A" }} />
            <p className="text-sm" style={{ color: "rgba(26,26,26,0.6)", fontFamily: "Georgia, serif" }}>
              Loading Khetha IQ...
            </p>
          </div>
        </div>
      )}
      <iframe
        key={retryKey}
        ref={iframeRef}
        src={iframeSrc}
        onLoad={handleLoad}
        title="Khetha IQ"
        className="w-full"
        style={{
          border: "none",
          minHeight: "calc(100vh - 64px)",
          display: loading ? "none" : "block",
        }}
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}