import React from "react";
import { Check, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

// One package in the comparison grid. Purely presentational: it never decides what a customer may
// buy — the server answers that, and the panel passes the answer in.
export default function PackageTierCard({ pkg, quote, state, onSelect }) {
  const isFree = pkg.tier === "free";
  const isCurrent = state.activeTier === pkg.tier;
  const highlight = pkg.tier === "pro";

  const label = (() => {
    if (isFree) return isCurrent ? "Your current page" : "Included";
    if (isCurrent) return "Active";
    if (!state.checkoutEnabled) return "Checkout not open";
    if (pkg.tier === "pro" && state.canUpgrade) return `Upgrade — ${quote?.price_label || pkg.price_label}`;
    if (state.canRenew) return `Renew 30 days — ${quote?.price_label || pkg.price_label}`;
    if (state.canPurchase) return `Buy 30 days — ${quote?.price_label || pkg.price_label}`;
    return "Unavailable";
  })();

  const disabled = isFree || isCurrent || !state.checkoutEnabled || state.busy
    || (!state.canPurchase && !state.canUpgrade);

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-5 ${
        highlight ? "border-[#B8956A] bg-[#FFFBF5] shadow-[0_18px_44px_rgba(184,149,106,0.18)]" : "border-[#B8956A]/25 bg-white"
      }`}
    >
      {highlight && (
        <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-[#B8956A] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]">
          <Sparkles className="h-3 w-3" /> Most complete
        </span>
      )}

      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B8956A]">{pkg.tier === "free" ? "Included" : "One-time"}</p>
      <h3 className="mt-1 font-serif text-xl text-[#1A1A1A]">{pkg.name}</h3>
      <p className="mt-1 text-sm text-[#1A1A1A]/55">{pkg.tagline}</p>

      <p className="mt-3 font-serif text-2xl text-[#1A1A1A]">
        {pkg.price_label}
        {pkg.term_days ? <span className="ml-1 text-sm font-sans text-[#1A1A1A]/50">/ {pkg.term_days} days</span> : null}
      </p>

      <ul className="mt-4 flex-1 space-y-1.5">
        {pkg.benefits.map((benefit) => (
          <li key={benefit} className="flex gap-2 text-sm text-[#1A1A1A]/75">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B8956A]" />
            <span>{benefit}</span>
          </li>
        ))}
        {pkg.unavailable.map((item) => (
          <li key={item} className="flex gap-2 text-sm text-[#1A1A1A]/35">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={() => onSelect(pkg.tier)}
        disabled={disabled}
        className={`mt-5 w-full ${highlight ? "bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]" : "bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#1A1A1A]/90"}`}
      >
        {label}
      </Button>
    </div>
  );
}