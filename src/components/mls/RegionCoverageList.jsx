import React from "react";
import { ShieldCheck } from "lucide-react";

/**
 * Read-only view of a provider's official jurisdiction list, grouped by state.
 * The list is the authority for routing, so it is shown exactly as configured rather than edited
 * field by field — administrators restore or correct it from the service-area settings.
 */
export default function RegionCoverageList({ jurisdictions = [], source }) {
  const byState = (jurisdictions || []).reduce((acc, jurisdiction) => {
    const state = jurisdiction?.state || "—";
    if (!acc[state]) acc[state] = [];
    acc[state].push(jurisdiction);
    return acc;
  }, {});
  const states = Object.keys(byState).sort();

  return (
    <div className="rounded-lg border border-[#B8956A]/25 bg-[#B8956A]/5 p-2.5 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/50 flex items-center gap-1">
        <ShieldCheck className="w-3 h-3 text-[#B8956A]" />
        Official coverage — {jurisdictions.length} jurisdictions
      </p>
      {states.map((state) => (
        <p key={state} className="text-[11px] leading-relaxed text-[#1A1A1A]/70">
          <span className="font-medium text-[#1A1A1A]/80">{state}:</span>{" "}
          {byState[state].map((j) => j.name).join(", ")}
        </p>
      ))}
      <p className="text-[10px] text-[#1A1A1A]/45">
        {source ? `Source: ${source}. ` : ""}
        Matched on normalized state + county or independent city only — never on zip prefixes or town names.
        Geographic coverage is not proof of the customer's MLS membership.
      </p>
    </div>
  );
}