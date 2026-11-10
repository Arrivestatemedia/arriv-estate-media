import React from "react";
import { Mail, Phone, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import { channelLabel, deliveryLabel, formatWhen } from "@/lib/propertyLeads";

const BADGE_STYLES = {
  delivered: "bg-[#B8956A]/15 text-[#8a6d4a] border-[#B8956A]/30",
  pending: "bg-black/5 text-[#1A1A1A]/60 border-black/10",
  retrying: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  failed: "bg-red-600/10 text-red-700 border-red-600/30",
  recorded: "bg-black/5 text-[#1A1A1A]/60 border-black/10",
};

// One lead. The buyer's message is the point of the record, so it is shown in full rather than
// truncated, and the delivery state is stated plainly instead of being implied by a colour alone.
export default function LeadCard({ lead, address, busy, onClose, onReopen, onResend }) {
  const closed = lead.status === "closed";
  const badgeKey = lead.lead_status || "recorded";

  return (
    <article className={`rounded-2xl border bg-white p-5 ${closed ? "border-black/10 opacity-70" : "border-[#B8956A]/25"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-base font-medium text-[#1A1A1A] truncate">{lead.name || "Unnamed buyer"}</p>
          <p className="text-xs text-[#1A1A1A]/50 truncate">{formatWhen(lead.created_at)}{address ? ` · ${address}` : ""}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-1 rounded-full bg-[#FFFBF5] border border-[#B8956A]/25 text-[#8a6d4a]">
            {channelLabel(lead)}
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-1 rounded-full border ${BADGE_STYLES[badgeKey] || BADGE_STYLES.recorded}`}>
            {deliveryLabel(lead)}
          </span>
        </div>
      </div>

      <p className="text-sm text-[#1A1A1A]/80 leading-relaxed whitespace-pre-wrap mb-4">{lead.message}</p>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 text-[#8a6d4a] hover:underline">
            <Mail className="w-4 h-4" /> {lead.email}
          </a>
        )}
        {lead.phone && (
          <a href={`tel:${String(lead.phone).replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1.5 text-[#8a6d4a] hover:underline">
            <Phone className="w-4 h-4" /> {lead.phone}
          </a>
        )}
      </div>

      {lead.delivery_error && (
        <p className="mt-3 text-xs text-red-700 bg-red-600/5 border border-red-600/20 rounded-lg px-3 py-2">
          {lead.delivery_error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-black/5">
        <button
          type="button"
          onClick={() => (closed ? onReopen(lead) : onClose(lead))}
          disabled={busy === lead.inquiry_id}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/10 text-xs font-semibold text-[#1A1A1A] hover:bg-[#1A1A1A]/5 disabled:opacity-50"
        >
          {closed ? "Reopen" : <><CheckCircle2 className="w-3.5 h-3.5" /> Mark handled</>}
        </button>
        {lead.lead_status === "failed" && (
          <button
            type="button"
            onClick={() => onResend(lead)}
            disabled={busy === lead.inquiry_id}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#B8956A] text-[#1A1A1A] text-xs font-semibold hover:bg-[#A68559] disabled:opacity-50"
          >
            {busy === lead.inquiry_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Resend email
          </button>
        )}
        {lead.lead_status === "pending" && lead.delivery_attempts > 0 && (
          <span className="text-[11px] text-[#1A1A1A]/45">
            {lead.delivery_attempts} send attempt{lead.delivery_attempts === 1 ? "" : "s"} so far, retrying automatically
          </span>
        )}
      </div>
    </article>
  );
}