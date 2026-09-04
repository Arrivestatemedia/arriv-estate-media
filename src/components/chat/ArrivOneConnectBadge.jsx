import React from "react";

/**
 * Arriv One Connect product identity badge.
 * Canonical text-based badge — "Arriv One | CONNECT".
 * This IS the canonical Connect product identity; do not replace with a logo.
 *
 * @param {boolean} compact — renders the 32px square "C" variant for narrow rails.
 */
export function ArrivOneConnectBadge({ compact = false, className = "" }) {
  if (compact) {
    return (
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${className}`}
        style={{ backgroundColor: "#4B2A78" }}
        aria-label="Arriv One Connect"
      >
        <span className="text-white text-[11px] font-bold leading-none">C</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span
        style={{
          color: "#4e6ccf",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Arriv One
      </span>

      <span
        style={{
          backgroundColor: "#482d71",
          color: "#FFFFFF",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          padding: "0.125rem 0.375rem",
          borderRadius: "0.25rem",
        }}
      >
        Connect
      </span>
    </div>
  );
}

export default ArrivOneConnectBadge;