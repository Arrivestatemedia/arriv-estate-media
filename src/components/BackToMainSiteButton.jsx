import React, { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";

const MAIN_SITE_HOST = "arrivestatemedia.com";
const STORAGE_KEY = "main_site_referrer";

function isFromMainSite(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      (host === MAIN_SITE_HOST || host.endsWith("." + MAIN_SITE_HOST)) &&
      host !== window.location.hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}

export default function BackToMainSiteButton() {
  const [referrer, setReferrer] = useState(null);

  useEffect(() => {
    // Remember the main-site page the visitor arrived from for this session,
    // so the back button stays available even as they browse the landing pages.
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      setReferrer(stored);
      return;
    }
    if (document.referrer && isFromMainSite(document.referrer)) {
      sessionStorage.setItem(STORAGE_KEY, document.referrer);
      setReferrer(document.referrer);
    }
  }, []);

  if (!referrer) return null;

  const handleBack = () => {
    // Use real browser history so visitors return to the exact page they
    // came from — the referrer header from the main site can be limited to
    // just the origin (domain), which would otherwise drop them on the home page.
    if (window.history.length > 1) {
      window.history.back();
    } else if (referrer) {
      window.location.href = referrer;
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="flex w-fit items-center gap-2 text-sm font-medium transition-colors mb-6 hover:opacity-100"
      style={{ color: "rgba(255,251,245,0.85)" }}
    >
      <ArrowLeft className="w-4 h-4" style={{ color: "#B8956A" }} />
      Back to Arriv Estate Media
    </button>
  );
}