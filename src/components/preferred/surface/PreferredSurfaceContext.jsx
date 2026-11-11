import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  RESUME_SHELL,
  clearResume,
  readResume,
  resumeLabel,
  saveResume,
} from "@/lib/preferredResume";

/**
 * The floating Preferred surfaces.
 *
 * A Preferred member never leaves the workspace for a standard portal page: everything they
 * click opens here, on top of the workspace, in the same gold-and-graphite language.
 */

const PreferredSurfaceContext = createContext({
  active: null,
  resumed: "",
  open: () => {},
  close: () => {},
});

export const usePreferredSurface = () => useContext(PreferredSurfaceContext);

// A resume is attempted once per page load. Moving around the portal afterwards is a remount,
// not a return, and must never drag the member back to a panel they have finished with.
let restoredThisLoad = false;
let pendingResume = null;

export function PreferredSurfaceProvider({ owner = "", children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(null);
  // Set only when the panel on screen was picked up from an earlier visit, so the concierge
  // knows to welcome the member back instead of greeting them as if they had just arrived.
  const [resumed, setResumed] = useState("");

  useEffect(() => {
    if (!owner) return;
    const record = pendingResume || (restoredThisLoad ? null : readResume(owner));
    if (!record) {
      restoredThisLoad = true;
      return;
    }
    restoredThisLoad = true;

    const path = record.path || RESUME_SHELL;
    if (path !== window.location.pathname) {
      // The workspace is a different page: the instance that mounts there restores the panel.
      pendingResume = record;
      navigate(`${path}${record.search || ""}${record.hash || ""}`, { replace: true });
      return;
    }

    pendingResume = null;
    const wanted = `${record.search || ""}${record.hash || ""}`;
    // The details she was carrying (an address, a date, a job) come back with the panel.
    if (wanted && wanted !== `${window.location.search}${window.location.hash}`) {
      navigate(`${path}${wanted}`, { replace: true });
    }
    setActive({ key: record.surface, at: Date.now() });
    setResumed(resumeLabel(record.surface));
  }, [navigate, owner]);

  // A panel on screen in the workspace is unfinished work. It is remembered for as long as it
  // is open, so a refresh, a sign-out or coming back later lands right back in it.
  useEffect(() => {
    if (!owner || !active?.key || location.pathname !== RESUME_SHELL) return;
    saveResume(owner, {
      surface: active.key,
      search: location.search,
      hash: location.hash,
      path: RESUME_SHELL,
    });
  }, [active, location.hash, location.pathname, location.search, owner]);

  const open = useCallback((key, options = {}) => {
    if (!key) return;
    // A hash lets the hosted screen land on its own section (billing, membership, analytics).
    if (options.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${options.hash}`);
    }
    setResumed("");
    setActive({ key, at: Date.now() });
  }, []);

  const close = useCallback(() => {
    setActive(null);
    setResumed("");
    clearResume(owner);
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, [owner]);

  const value = useMemo(() => ({ active, resumed, open, close }), [active, resumed, open, close]);

  return (
    <PreferredSurfaceContext.Provider value={value}>{children}</PreferredSurfaceContext.Provider>
  );
}