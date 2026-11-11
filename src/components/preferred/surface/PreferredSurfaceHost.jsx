import React, { Suspense, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Crown, Loader2, X } from "lucide-react";
import { SURFACES } from "./surfaces";
import { usePreferredSurface } from "./PreferredSurfaceContext";
import { HostedSurfaceProvider } from "./HostedSurfaceContext";

/**
 * The floating surface itself: the workspace stays visible behind it, the screen opens in the
 * same premium shell, and closing it returns the member to exactly where they were.
 */
export default function PreferredSurfaceHost() {
  const { active, close } = usePreferredSurface();
  const location = useLocation();
  const openedOn = useRef(null);
  const surface = active ? SURFACES[active.key] : null;

  // Billing, membership, analytics and company all live on one hosted screen: the surface
  // lands on its own section instead of the top of that page.
  useEffect(() => {
    // The inline working panel scrolls to its own section; the page itself stays where it is.
    if (!surface?.hash || location.pathname === "/PreferredWorkspace") return;
    const target = document.querySelector(surface.hash);
    if (target) target.scrollIntoView({ block: "start" });
  }, [active, surface, location.pathname]);

  useEffect(() => {
    if (active) openedOn.current = `${window.location.pathname}${window.location.search}`;
  }, [active]);

  // A real navigation from inside the surface (checkout, sign-in, a job gallery) hands control
  // back to the router rather than leaving a stale screen floating.
  useEffect(() => {
    if (!active || !openedOn.current) return;
    if (`${location.pathname}${location.search}` !== openedOn.current) close();
  }, [active, location.pathname, location.search, close]);

  // Only a real dialog locks the page behind it. Inline in the workspace there is nothing to
  // lock, and locking it would freeze the member's own scrolling.
  useEffect(() => {
    if (!active || location.pathname === "/PreferredWorkspace") return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [active, close, location.pathname]);

  // Inside the member's own workspace the surface is not a dialog at all: it opens inline,
  // beside the concierge, and the workspace itself recolours around it.
  const onWorkspace = location.pathname === "/PreferredWorkspace";
  if (!active || !surface || onWorkspace) return null;
  const Component = surface.Component;

  return createPortal(
    <div
      className="preferred-surface-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={surface.title}
      onClick={close}
    >
      <div className="preferred-surface" onClick={(event) => event.stopPropagation()}>
        <header className="preferred-surface-head">
          <div className="min-w-0">
            <p className="preferred-surface-eyebrow flex items-center gap-1.5">
              <Crown className="h-3 w-3" /> Arriv Preferred
            </p>
            <h2 className="preferred-surface-title font-serif">{surface.title}</h2>
            {surface.caption && <p className="preferred-surface-caption">{surface.caption}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="preferred-surface-close preferred-focus"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <main className="preferred-surface-body preferred-scroll">
          <Suspense
            fallback={(
              <div className="flex min-h-[40vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#c8a87c]" />
              </div>
            )}
          >
            <HostedSurfaceProvider value={true}>
              <Component />
            </HostedSurfaceProvider>
          </Suspense>
        </main>
      </div>
    </div>,
    document.body,
  );
}