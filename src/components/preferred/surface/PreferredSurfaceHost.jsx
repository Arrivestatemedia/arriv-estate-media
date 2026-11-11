import React, { Suspense, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Crown, Loader2, X } from "lucide-react";
import { SURFACES } from "./surfaces";
import { usePreferredSurface } from "./PreferredSurfaceContext";

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
    if (!surface?.hash) return;
    const target = document.querySelector(surface.hash);
    if (target) target.scrollIntoView({ block: "start" });
  }, [active, surface]);

  useEffect(() => {
    if (active) openedOn.current = `${window.location.pathname}${window.location.search}`;
  }, [active]);

  // A real navigation from inside the surface (checkout, sign-in, a job gallery) hands control
  // back to the router rather than leaving a stale screen floating.
  useEffect(() => {
    if (!active || !openedOn.current) return;
    if (`${location.pathname}${location.search}` !== openedOn.current) close();
  }, [active, location.pathname, location.search, close]);

  useEffect(() => {
    if (!active) return undefined;
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
  }, [active, close]);

  if (!active || !surface) return null;
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
            <Component />
          </Suspense>
        </main>
      </div>
    </div>,
    document.body,
  );
}