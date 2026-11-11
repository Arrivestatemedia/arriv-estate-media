import React from "react";
import { Link } from "react-router-dom";
import { usePreferred } from "@/components/preferred/PreferredProvider";
import { usePreferredSurface } from "./PreferredSurfaceContext";

/**
 * A portal link that, for a Preferred member, opens the destination as a floating surface
 * instead of leaving the workspace. Everyone else keeps the ordinary link.
 */
export default function PreferredSurfaceLink({ surface, to, className, children, onClick }) {
  const { preferred } = usePreferred();
  const { open } = usePreferredSurface();

  if (!preferred) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
        open(surface);
      }}
    >
      {children}
    </button>
  );
}