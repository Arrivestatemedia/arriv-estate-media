import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * The floating Preferred surfaces.
 *
 * A Preferred member never leaves the workspace for a standard portal page: everything they
 * click opens here, on top of the workspace, in the same gold-and-graphite language.
 */

const PreferredSurfaceContext = createContext({
  active: null,
  open: () => {},
  close: () => {},
});

export const usePreferredSurface = () => useContext(PreferredSurfaceContext);

export function PreferredSurfaceProvider({ children }) {
  const [active, setActive] = useState(null);

  const open = useCallback((key, options = {}) => {
    if (!key) return;
    // A hash lets the hosted screen land on its own section (billing, membership, analytics).
    if (options.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${options.hash}`);
    }
    setActive({ key, at: Date.now() });
  }, []);

  const close = useCallback(() => {
    setActive(null);
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const value = useMemo(() => ({ active, open, close }), [active, open, close]);

  return (
    <PreferredSurfaceContext.Provider value={value}>{children}</PreferredSurfaceContext.Provider>
  );
}