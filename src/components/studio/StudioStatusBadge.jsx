import React from "react";

// Canonical Studio status badges — compact, rounded, Studio color system.
// Neutral/draft/planning: muted charcoal
// Script/generative: coral
// Producing/rendering: coral/electric coral (pulse)
// Ready/approved/available: green
// Limited: amber
// Failed/unavailable: red
const STATUS_STYLES = {
  // Planning / draft states
  DRAFT: { bg: "rgba(250,248,245,0.08)", color: "rgba(250,248,245,0.5)", label: "Draft" },
  PLANNING: { bg: "rgba(250,248,245,0.08)", color: "rgba(250,248,245,0.5)", label: "Planning" },
  BRIEF: { bg: "rgba(250,248,245,0.08)", color: "rgba(250,248,245,0.5)", label: "Brief" },
  PENDING: { bg: "rgba(250,248,245,0.08)", color: "rgba(250,248,245,0.5)", label: "Pending" },
  // Script / generative states
  SCRIPTING: { bg: "rgba(255,90,79,0.15)", color: "#FF5A4F", label: "Scripting" },
  SCRIPT_APPROVED: { bg: "rgba(255,90,79,0.15)", color: "#FF5A4F", label: "Script Approved" },
  AI_REVIEW: { bg: "rgba(255,90,79,0.15)", color: "#FF5A4F", label: "AI Review" },
  GENERATING: { bg: "rgba(255,90,79,0.15)", color: "#FF5A4F", label: "Generating", pulse: true },
  DIRECTING: { bg: "rgba(255,90,79,0.15)", color: "#FF5A4F", label: "Directing" },
  STORYBOARD_APPROVED: { bg: "rgba(255,90,79,0.15)", color: "#FF5A4F", label: "Storyboard Approved" },
  // Production states
  PRODUCING: { bg: "rgba(255,116,107,0.18)", color: "#FF746B", label: "Producing", pulse: true },
  RENDERING: { bg: "rgba(255,116,107,0.18)", color: "#FF746B", label: "Rendering", pulse: true },
  AUDIO_QC: { bg: "rgba(255,116,107,0.18)", color: "#FF746B", label: "Audio QC" },
  // Ready / approved states
  READY: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Ready" },
  APPROVED: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Approved" },
  AVAILABLE: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Available" },
  DISTRIBUTED: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Distributed" },
  CLIENT_REVIEW: { bg: "rgba(34,197,94,0.12)", color: "#22c55e", label: "Client Review" },
  REVIEW: { bg: "rgba(34,197,94,0.12)", color: "#22c55e", label: "Review" },
  // Limited
  LIMITED: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Limited" },
  // Failed
  FAILED: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Failed" },
  UNAVAILABLE: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Unavailable" },
};

export default function StudioStatusBadge({ status, size = "sm" }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.DRAFT;
  const fontSize = size === "xs" ? "0.625rem" : "0.75rem";
  const padding = size === "xs" ? "0.125rem 0.5rem" : "0.2rem 0.6rem";

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold whitespace-nowrap ${style.pulse ? "animate-pulse" : ""}`}
      style={{
        background: style.bg,
        color: style.color,
        fontSize,
        padding,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {style.label}
    </span>
  );
}