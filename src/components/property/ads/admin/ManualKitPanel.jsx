import React from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { money } from "@/lib/propertyAds";

// Everything an administrator needs on screen to build this campaign by hand in Meta Ads Manager:
// the approved creative and copy, the page it must link to, the budget ceiling, the duration, and
// the housing advertising rules that apply.
export default function ManualKitPanel({ kit }) {
  if (!kit) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#B8956A]/25 bg-[#FFFBF5] p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Build this in Meta Ads Manager</p>
        <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">{kit.headline}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#1A1A1A]/70">{kit.primary_text}</p>
        {kit.description && <p className="mt-1 text-xs leading-relaxed text-[#1A1A1A]/60">{kit.description}</p>}
        <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#1A1A1A]/70">
          <div>
            <dt className="text-[#1A1A1A]/40">Call to action</dt>
            <dd className="font-medium">{kit.call_to_action || "—"}</dd>
          </div>
          <div>
            <dt className="text-[#1A1A1A]/40">Special ad category</dt>
            <dd className="font-medium">{kit.special_ad_category}</dd>
          </div>
          <div>
            <dt className="text-[#1A1A1A]/40">Budget ceiling</dt>
            <dd className="font-medium">{kit.ad_budget_label}</dd>
          </div>
          <div>
            <dt className="text-[#1A1A1A]/40">Duration</dt>
            <dd className="font-medium">{kit.duration_days} days</dd>
          </div>
        </dl>
        {kit.property_url && (
          <a
            href={kit.property_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#B8956A] hover:underline"
          >
            Property page this campaign must link to <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {kit.property_address && <p className="mt-1 text-[11px] text-[#1A1A1A]/50">{kit.property_address}</p>}
      </div>

      {kit.variations?.length > 1 && (
        <div className="rounded-xl border border-[#B8956A]/20 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Approved variations</p>
          <ul className="mt-1 space-y-1">
            {kit.variations.map((variation, index) => (
              <li key={index} className="text-[11px] leading-relaxed text-[#1A1A1A]/65">
                {variation.label ? <span className="font-medium text-[#1A1A1A]/80">{variation.label}: </span> : null}
                {variation.headline}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-900">
          <ShieldAlert className="h-3.5 w-3.5" /> Required housing advertising rules
        </p>
        <ul className="mt-1 space-y-1">
          {kit.disclosures.map((line) => (
            <li key={line} className="text-[11px] leading-relaxed text-amber-900/85">• {line}</li>
          ))}
        </ul>
      </div>

      <p className="text-[10px] text-[#1A1A1A]/40">
        Advertising budget reserved: {money(kit.ad_budget_cents)} · results are read from {kit.results_source}
      </p>
    </div>
  );
}