import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { money } from "@/lib/propertyAds";

// The exact creative and budget the customer is about to buy.
//
// Everything shown here was assembled server-side from the approved listing content: no feature,
// price, amenity or availability is invented. Approving is what authorises this campaign, at this
// creative, at this budget — a material change later invalidates that approval.
export default function AdCreativeApproval({ campaign, packagePriceCents, busy, onApprove, onCancel }) {
  const [confirmed, setConfirmed] = useState(false);
  const creative = campaign?.creative || {};

  return (
    <div className="rounded-2xl border border-[#B8956A]/30 bg-white p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/45">Your ad, before anything is charged</p>
      <h3 className="mt-1 font-serif text-xl text-[#1A1A1A]">{campaign?.package_name || "Advertising campaign"}</h3>

      <div className="mt-4 rounded-xl border border-[#B8956A]/25 bg-[#FFFBF5] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/40">Sponsored</p>
        <p className="mt-1 font-semibold text-[#1A1A1A]">{creative.headline || "Headline prepared on the server"}</p>
        <p className="mt-1 text-sm leading-relaxed text-[#1A1A1A]/70">{creative.primary_text || ""}</p>
        {creative.description && <p className="mt-1 text-xs text-[#1A1A1A]/50">{creative.description}</p>}
        <p className="mt-2 text-xs font-semibold text-[#B8956A]">{creative.call_to_action || "Learn more"}</p>
      </div>

      <dl className="mt-4 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <dt className="text-xs text-[#1A1A1A]/60">Campaign budget</dt>
          <dd className="text-sm font-semibold text-[#1A1A1A]">{money(campaign?.ad_budget_cents ?? campaign?.budget?.ad_budget_cents)}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-xs text-[#1A1A1A]/60">Total charged once</dt>
          <dd className="text-sm font-semibold text-[#1A1A1A]">{money(packagePriceCents ?? campaign?.total_cents)}</dd>
        </div>
      </dl>

      <label className="mt-4 flex cursor-pointer gap-3 rounded-xl border border-[#B8956A]/25 p-3">
        <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-0.5" />
        <span className="text-xs leading-relaxed text-[#1A1A1A]/70">
          I am authorised to advertise this property, this creative and budget are correct, and I understand Arriv runs the
          campaign in its own advertising accounts.
        </span>
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          onClick={onApprove}
          disabled={!confirmed || busy}
          className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] disabled:bg-[#B8956A]/40"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Approve and continue to payment
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy} className="text-[#1A1A1A]/60">
          Not now
        </Button>
      </div>
    </div>
  );
}