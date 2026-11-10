import React from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Megaphone } from "lucide-react";
import { money } from "@/lib/propertyAds";

// One advertising package. The price shown is the total the customer pays; how much of it becomes
// advertising budget and how much is Arriv's management fee is stated plainly, because that split is
// the whole difference between an advertising package and a placement.
export default function AdPackageCard({ pkg, state, onSelect }) {
  const priceLabel = pkg.price_label || money(pkg.price_cents);
  const busy = state?.busyTier === pkg.tier;
  const isCurrent = state?.activeTier === pkg.tier;
  const disabled = !state?.canPurchase || state?.busy || isCurrent;

  return (
    <div
      className={`flex h-full flex-col rounded-2xl border bg-white p-5 ${
        pkg.recommended ? "border-[#B8956A] shadow-[0_1px_0_0_rgba(184,149,106,0.4)]" : "border-[#B8956A]/25"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/45">Arriv managed advertising</p>
          <h3 className="mt-1 font-serif text-xl text-[#1A1A1A]">{pkg.name}</h3>
        </div>
        {pkg.recommended && (
          <span className="rounded-full bg-[#B8956A] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1A1A1A]">
            Recommended
          </span>
        )}
      </div>

      <p className="mt-3 font-serif text-3xl text-[#1A1A1A]">{priceLabel}</p>
      <p className="text-xs text-[#1A1A1A]/50">{pkg.duration_label || `One-time · runs ${pkg.duration_days} days`} · nothing renews</p>
      {pkg.tagline && <p className="mt-2 text-xs leading-relaxed text-[#1A1A1A]/60">{pkg.tagline}</p>}

      <dl className="mt-4 space-y-1.5 border-t border-[#B8956A]/20 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-[#1A1A1A]/60">Advertising budget</dt>
          <dd className="text-sm font-semibold text-[#1A1A1A]">{money(pkg.ad_budget_cents)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-[#1A1A1A]/60">Arriv management fee</dt>
          <dd className="text-sm font-semibold text-[#1A1A1A]">{money(pkg.management_fee_cents)}</dd>
        </div>
      </dl>

      <ul className="mt-4 flex-1 space-y-1.5">
        {(pkg.benefits || []).map((line) => (
          <li key={line} className="flex gap-2 text-xs leading-relaxed text-[#1A1A1A]/65">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-[#B8956A]" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={() => onSelect(pkg.tier)}
        disabled={disabled}
        className="mt-4 w-full bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] disabled:bg-[#B8956A]/40"
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
        {isCurrent ? "This campaign is running" : `Continue with ${pkg.name}`}
      </Button>
    </div>
  );
}