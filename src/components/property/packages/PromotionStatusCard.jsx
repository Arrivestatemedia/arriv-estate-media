import React from "react";
import { CalendarClock, Ban, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

function dateLabel(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// The customer's live package: what it is, how long is left, and where it is placed.
export default function PromotionStatusCard({ promotion, entitlement, busy, onCancel }) {
  if (!promotion) return null;
  const paused = promotion.status === "paused";

  return (
    <div className="rounded-2xl border border-[#B8956A]/30 bg-[#1A1A1A] p-5 text-[#FFFBF5]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B8956A]">
            {entitlement?.active ? "Active package" : paused ? "Package paused" : "Package"}
          </p>
          <h3 className="mt-1 font-serif text-2xl">{promotion.package_name}</h3>
          <p className="mt-1 text-sm text-[#FFFBF5]/60">
            {promotion.placement_label ? `${promotion.placement_label} placement` : "No placement while paused"} · {promotion.price_label} one-time
          </p>
        </div>

        <div className="text-right">
          <p className="font-serif text-3xl text-[#B8956A]">{promotion.days_remaining}</p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#FFFBF5]/50">
            {promotion.days_remaining === 1 ? "day left" : "days left"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#FFFBF5]/60">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-[#B8956A]" /> Ends {dateLabel(promotion.ends_at)}
        </span>
        {promotion.activated_at ? <span>Started {dateLabel(promotion.activated_at)}</span> : null}
        {promotion.refund_status && promotion.refund_status !== "none" ? <span>Refund: {promotion.refund_status}</span> : null}
      </div>

      {paused && (
        <div className="mt-4 flex gap-2 rounded-xl border border-[#B8956A]/30 bg-[#B8956A]/10 p-3 text-xs text-[#FFFBF5]/75">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B8956A]" />
          <p>
            Your property page is not currently shown as available, so the placement is paused. Your remaining days are held for
            you and start again as soon as the page is eligible. Confirm the listing status in the panel above to restore it.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          className="border-[#FFFBF5]/25 bg-transparent text-[#FFFBF5]/70 hover:bg-[#FFFBF5]/10 hover:text-[#FFFBF5]"
        >
          <Ban className="mr-1.5 h-3.5 w-3.5" /> End placement
        </Button>
        <p className="text-[11px] text-[#FFFBF5]/40">
          Ending a placement does not unpublish your property page, and does not issue an automatic refund.
        </p>
      </div>
    </div>
  );
}