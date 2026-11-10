import React from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Clock, ExternalLink, Radio } from "lucide-react";
import { AD_STATUS_LABELS, AD_STATUS_STYLES, formatDate, metric, money } from "@/lib/propertyAds";

// The live state of one purchased campaign. Figures here are only ever what the advertising platform
// reported; nothing is estimated, and an empty figure says so instead of showing a zero.
export default function AdCampaignStatusCard({ campaign, busy, onCancel, onRefresh }) {
  if (!campaign) return null;

  const budget = campaign.budget || {};
  const metrics = campaign.metrics || {};
  const statusLabel = campaign.status_label || AD_STATUS_LABELS[campaign.status] || campaign.status;
  const statusStyle = AD_STATUS_STYLES[campaign.status] || "bg-[#1A1A1A]/5 text-[#1A1A1A]/60";
  const canCancel = (campaign.actions || []).includes("cancel");

  return (
    <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/45">{campaign.package_name || "Advertising campaign"}</p>
          <h3 className="mt-1 flex items-center gap-2 font-serif text-xl text-[#1A1A1A]">
            <Radio className="h-4 w-4 text-[#B8956A]" /> {statusLabel}
          </h3>
          {campaign.status_help && <p className="mt-1 max-w-md text-xs leading-relaxed text-[#1A1A1A]/55">{campaign.status_help}</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusStyle}`}>{statusLabel}</span>
      </div>

      {(campaign.review_required || campaign.rejection_reason || campaign.attention_reason) && (
        <div className="mt-3 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
          <span>{campaign.rejection_reason || campaign.attention_reason || "Our team is reviewing this campaign."}</span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Budget</p>
          <p className="text-sm font-semibold text-[#1A1A1A]">{money(budget.ad_budget_cents ?? campaign.ad_budget_cents)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Spent so far</p>
          <p className="text-sm font-semibold text-[#1A1A1A]">{money(budget.spent_cents ?? campaign.spent_cents ?? 0)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Remaining</p>
          <p className="text-sm font-semibold text-[#1A1A1A]">{money(budget.remaining_cents)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/40">Runs until</p>
          <p className="text-sm font-semibold text-[#1A1A1A]">{formatDate(campaign.ends_at)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#B8956A]/20 bg-[#FFFBF5] p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/45">Platform results</p>
        {metrics.reported_at ? (
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-[#1A1A1A]/45">Impressions</p>
              <p className="text-sm font-semibold text-[#1A1A1A]">{metric(metrics.impressions)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#1A1A1A]/45">Clicks</p>
              <p className="text-sm font-semibold text-[#1A1A1A]">{metric(metrics.clicks)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#1A1A1A]/45">Spend</p>
              <p className="text-sm font-semibold text-[#1A1A1A]">{money(metrics.spend_cents)}</p>
            </div>
          </div>
        ) : (
          <p className="mt-1 flex items-center gap-2 text-xs text-[#1A1A1A]/50">
            <Clock className="h-3.5 w-3.5" /> Not reported yet. Figures appear once the advertising platform reports them.
          </p>
        )}
        {campaign.public_url && (
          <a
            href={campaign.public_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#B8956A] hover:underline"
          >
            View the page this campaign sends people to <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy} className="border-[#B8956A]/30">
            Refresh
          </Button>
        )}
        {canCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy} className="text-red-600 hover:bg-red-50">
            End this campaign
          </Button>
        )}
      </div>
    </div>
  );
}