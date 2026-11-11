import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { getCustomerSessionToken } from "@/lib/customerSession";
import { fetchConciergeEntitlement } from "@/lib/conciergeClient";
import PreferredConcierge from "@/components/preferred/PreferredConcierge";
import PreferredWelcome from "@/components/preferred/PreferredWelcome";
import "@/preferred.css";

/**
 * Resolves the Preferred entitlement for the signed-in customer and, only when it is
 * genuinely active, turns on the premium portal + concierge.
 *
 * Standard customers, media partners, sales reps and admins are unaffected: the body
 * class is never applied and nothing is fetched.
 */

const PreferredContext = createContext({
  loading: false,
  preferred: false,
  entitlement: null,
  customer: null,
  unreadNotices: 0,
  refresh: () => {},
});

export const usePreferred = () => useContext(PreferredContext);

const PORTAL_ROUTES = [
  "/PreferredWorkspace",
  "/ClientBookings",
  "/BookingPage",
  "/PropertyLeads",
  "/PropertyPageBuilder",
  "/VisibilityDashboard",
  "/PrepaidPurchase",
  "/AutoFund",
  "/ClientJobGallery",
  "/PublicAccountSettings",
];

const EMPTY = { loading: false, preferred: false, entitlement: null, customer: null, unreadNotices: 0 };

export default function PreferredProvider({ user, children }) {
  const location = useLocation();
  const isCustomer = user?.user_type === "client";
  const [state, setState] = useState({ ...EMPTY, loading: isCustomer });

  const refresh = useCallback(async () => {
    if (!isCustomer || !getCustomerSessionToken()) {
      setState(EMPTY);
      return;
    }
    try {
      const result = await fetchConciergeEntitlement();
      if (!result?.ok) {
        setState(EMPTY);
        return;
      }
      setState({
        loading: false,
        preferred: result.preferred === true,
        entitlement: result.entitlement || null,
        customer: result.customer || null,
        unreadNotices: Number(result.unread_notices || 0),
      });
    } catch {
      // A concierge failure must never block the portal or log anybody out.
      setState(EMPTY);
    }
  }, [isCustomer, user?.email]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const inPortal = PORTAL_ROUTES.some((route) => location.pathname === route
    || location.pathname.startsWith(`${route}/`));

  useEffect(() => {
    const active = state.preferred && inPortal;
    const body = document.body;
    if (active) body.classList.add("preferred-portal");
    return () => body.classList.remove("preferred-portal");
  }, [state.preferred, inPortal]);

  // The workspace replaces the whole client portal for a Preferred member, and the nav
  // lives above this provider: publish the verdict so it can collapse to that one page.
  useEffect(() => {
    try {
      if (state.preferred) localStorage.setItem("arriv_preferred", "1");
      else localStorage.removeItem("arriv_preferred");
    } catch {
      /* storage unavailable: the nav simply keeps its default items */
    }
    window.dispatchEvent(new CustomEvent("arriv:preferred", { detail: { preferred: state.preferred } }));
  }, [state.preferred]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  // The workspace page runs the concierge on its own stage; the floating dock would be a second session.
  const onWorkspace = location.pathname === "/PreferredWorkspace";

  return (
    <PreferredContext.Provider value={value}>
      {children}
      {state.preferred && !onWorkspace && state.entitlement?.concierge_enabled !== false && (
        <PreferredConcierge user={user} customer={state.customer} entitlement={state.entitlement} />
      )}
      {state.preferred && <PreferredWelcome customer={state.customer} />}
    </PreferredContext.Provider>
  );
}