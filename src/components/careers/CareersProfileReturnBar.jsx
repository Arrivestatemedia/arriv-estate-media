import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const GOLD = "#B8956A";
const DARK = "#1A1A1A";

/**
 * Strip shown on a public job page only when the visitor opened it from their
 * personalized Careers Profile: it is the way back to that exact page.
 * Renders nothing when no profile belongs to this visit.
 */
export default function CareersProfileReturnBar({ href, tone = "dark" }) {
  if (!href) return null;
  const isDark = tone === "dark";

  return (
    <div
      className={isDark ? undefined : "rounded-xl mb-4"}
      style={
        isDark
          ? { backgroundColor: DARK, borderBottom: "1px solid rgba(184,149,106,0.45)" }
          : { backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.45)" }
      }
    >
      <div className="max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs sm:text-sm" style={{ color: isDark ? "rgba(255,251,245,0.82)" : DARK }}>
          You are viewing the full position details from your Careers Profile. Your progress is saved.
        </p>
        <Link
          to={href}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap"
          style={{ backgroundColor: GOLD, color: "#000000" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Careers Profile
        </Link>
      </div>
    </div>
  );
}