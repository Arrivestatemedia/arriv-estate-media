import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MapPin } from "lucide-react";

// Regional Media Specialist job pages:
//   DMV (DC, MD, VA) → /MediaSpecialist        (Maryland market)
//   Georgia (GA)     → /MediaSpecialistAtl     (Atlanta market)
//   Anywhere else    → /MediaSpecialist        (default market)

const DMV_STATES = new Set([
  "dc", "d.c.", "district of columbia", "washington dc", "washington, dc",
  "md", "maryland",
  "va", "virginia",
]);

const GA_STATES = new Set([
  "ga", "georgia",
]);

const DEFAULT_ROUTE = "/MediaSpecialist";
const ATLANTA_ROUTE = "/MediaSpecialistAtl";

function normalizeState(s) {
  return String(s || "").trim().toLowerCase();
}

function routeForState(state) {
  const norm = normalizeState(state);
  if (GA_STATES.has(norm)) return ATLANTA_ROUTE;
  if (DMV_STATES.has(norm)) return DEFAULT_ROUTE;
  return DEFAULT_ROUTE;
}

export default function RegionalJobRouter() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let route = DEFAULT_ROUTE;
      let resolved = false;

      // Client-side geolocation: the browser's fetch carries the visitor's
      // real IP directly to the geolocation API (no server-side IP header
      // passing). ipwho.is auto-detects the caller IP and supports CORS.
      try {
        const r = await fetch("https://ipwho.is/");
        if (r.ok) {
          const d = await r.json();
          if (d && d.success !== false && (d.region || d.region_code)) {
            route = routeForState(d.region || d.region_code);
            resolved = true;
          }
        }
      } catch (_e) {
        // try fallback provider
      }

      // Fallback: ipapi.co (also CORS-enabled, auto-detects caller IP).
      if (!resolved) {
        try {
          const r = await fetch("https://ipapi.co/json/");
          if (r.ok) {
            const d = await r.json();
            if (d && !d.error && (d.region || d.region_code)) {
              route = routeForState(d.region || d.region_code);
              resolved = true;
            }
          }
        } catch (_e) {
          // both providers failed — use default route
        }
      }

      if (!mounted) return;
      if (!resolved) setFailed(true);
      // Brief beat so the loading state is visible on fast networks.
      setTimeout(() => navigate(route, { replace: true }), resolved ? 350 : 1200);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[#B8956A]/10 flex items-center justify-center mb-5">
          <MapPin className="w-7 h-7 text-[#B8956A]" />
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-[#B8956A] mb-3" />
        <p className="text-[#1A1A1A] font-medium text-base mb-1">
          {failed
            ? "Redirecting you to our careers page…"
            : "Finding the right opportunity for your area…"}
        </p>
        <p className="text-[#1A1A1A]/50 text-sm">
          Detecting your region to show nearby Media Specialist roles.
        </p>
      </div>
    </div>
  );
}