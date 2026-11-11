import React, { Suspense, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Crown, Loader2, X } from "lucide-react";
import { SURFACES } from "@/components/preferred/surface/surfaces";
import { usePreferredSurface } from "@/components/preferred/surface/PreferredSurfaceContext";

/**
 * The working half of the workspace.
 *
 * When the member asks the concierge for bookings, properties, a gallery or their numbers,
 * the real screen opens HERE — beside her, inside the workspace — rather than as a dialog
 * over the portal. The concierge stays live on her own panel while they work.
 */
export default function PreferredSurfacePanel() {
  const { active, close } = usePreferredSurface();
  const location = useLocation();
  const surface = active ? SURFACES[active.key] : null;
  const bodyRef = useRef(null);

  // Billing, membership and analytics live on one hosted screen: land on the section that
  // was actually asked for, inside the panel.
  useEffect(() => {
    if (!surface?.hash) return;
    const target = bodyRef.current?.querySelector(surface.hash);
    if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [active, surface]);

  if (!active || !surface) return null;
  const Component = surface.Component;
  // The screen re-opens when the details she carries change (an address she just wrote into the
  // booking form), so the form arrives filled in instead of ignoring the new value.
  const surfaceKey = `${active.key}:${location.search}`;

  return (
    <section
      key={surfaceKey}
      className="preferred-glass preferred-panel"
      aria-label={surface.title}
    >
      <header className="preferred-panel-head">
        <div className="min-w-0">
          <p className="preferred-surface-eyebrow flex items-center gap-1.5">
            <Crown className="h-3 w-3" /> Arriv Preferred
          </p>
          <h2 className="preferred-panel-title font-serif">{surface.title}</h2>
          {surface.caption && <p className="preferred-panel-caption">{surface.caption}</p>}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close this and bring the concierge back to full size"
          className="preferred-surface-close preferred-focus"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={bodyRef} className="preferred-panel-body preferred-scroll">
        <Suspense
          fallback={(
            <div className="preferred-panel-loading">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#c8a87c]/35 bg-[#c8a87c]/10">
                <Loader2 className="h-5 w-5 animate-spin text-[#e2c79b]" />
              </span>
              <p className="preferred-panel-loading-text">
                Bringing up your {surface.title.toLowerCase()}…
              </p>
              <span className="preferred-panel-sheen" aria-hidden="true" />
            </div>
          )}
        >
          <Component />
        </Suspense>
      </div>
    </section>
  );
}