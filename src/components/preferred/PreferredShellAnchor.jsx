import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePreferred } from "@/components/preferred/PreferredProvider";
import { usePreferredSurface } from "@/components/preferred/surface/PreferredSurfaceContext";

/**
 * The workspace IS the Preferred experience, so it is never replaced.
 *
 * A member arriving on one of the standard portal screens (a login landing, a bookmark, a
 * link inside a surface) is put back on the workspace with that screen floating on top of it,
 * so the concierge, the shell and the chat never disappear.
 */
const SURFACE_FOR_ROUTE = {
  "/ClientBookings": "dashboard",
  "/BookingPage": "booking",
  "/PropertyLeads": "properties",
  "/PropertyPageBuilder": "marketing",
  "/VisibilityDashboard": "analytics",
  "/PublicAccountSettings": "account",
  "/ClientJobGallery": "jobGallery",
};

export default function PreferredShellAnchor() {
  const { preferred } = usePreferred();
  const { open } = usePreferredSurface();
  const location = useLocation();
  const navigate = useNavigate();
  const pending = useRef(null);

  useEffect(() => {
    if (!preferred) return;
    const key = SURFACE_FOR_ROUTE[location.pathname];
    if (!key) return;
    pending.current = key;
    // Search params survive, so a screen keeps its own deep link (a job gallery, a listing).
    navigate(`/PreferredWorkspace${location.search || ""}`, { replace: true });
  }, [preferred, location.pathname, location.search, navigate]);

  // Opened only once the workspace is the current route, so the surface is never closed
  // by the navigation that brought us here.
  useEffect(() => {
    if (location.pathname !== "/PreferredWorkspace" || !pending.current) return;
    const key = pending.current;
    pending.current = null;
    open(key);
  }, [location.pathname, open]);

  return null;
}