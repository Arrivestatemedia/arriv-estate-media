import React from "react";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * AutoFundTierCard — one Auto-Fund tier, rendered entirely from the canonical
 * tier catalog returned by the backend. No price, bonus or fee is hardcoded here,
 * so a tier change can never leave the interface showing a stale number.
 */
export default function AutoFundTierCard({ tier, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tier.amount)}
      className={`text-left w-full p-5 rounded-2xl border-2 transition-all bg-white ${
        selected ? "border-[#B8956A]" : "border-[#B8956A]/15 hover:border-[#B8956A]/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-serif text-xl text-[#1A1A1A]">{tier.tier_name}</p>
          <p className="text-sm text-[#1A1A1A]/60">${tier.amount}/month</p>
        </div>
        {tier.vip ? (
          <Badge className="bg-[#B8956A] text-[#1A1A1A]">VIP</Badge>
        ) : tier.bonus_pct > 0 ? (
          <Badge variant="outline" className="border-[#B8956A]/40 text-[#1A1A1A]">+{tier.bonus_pct}%</Badge>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Row label="Monthly deposit" value={`$${tier.amount}`} />
        <Row
          label={`Bonus Booking Value (${tier.bonus_pct}%)`}
          value={tier.bonus_booking_value > 0 ? `+$${tier.bonus_booking_value.toFixed(2)}` : "—"}
        />
        <Row
          label="Membership fee"
          value={tier.membership_fee > 0 ? `$${tier.membership_fee}` : "$0"}
        />
        <Row label="Total monthly charge" value={`$${tier.total_monthly_charge}`} strong />
        <Row label="Booking Value you receive" value={`$${tier.booking_value}`} strong />
      </div>

      <ul className="mt-3 pt-3 border-t border-[#B8956A]/15 space-y-1">
        {tier.benefits.map((b, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] text-[#1A1A1A]/70">
            <CheckCircle2 className="w-3 h-3 text-[#B8956A] mt-0.5 shrink-0" />
            {b}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-[#1A1A1A]/55">
        {tier.promotional_credit_usable_on_standalone_mls
          ? "Promotional Booking Value may be used on eligible services, including standalone MLS Walkthroughs. No monthly booking-count cap."
          : "Promotional Booking Value may be used on photography, video, premium packages and qualifying genuine bundles. It may not pay for a standalone MLS Walkthrough. Cash-funded Booking Value may."}
      </p>
    </button>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[#1A1A1A]/55">{label}</span>
      <span className={`text-xs ${strong ? "font-semibold text-[#1A1A1A]" : "text-[#1A1A1A]"}`}>{value}</span>
    </div>
  );
}