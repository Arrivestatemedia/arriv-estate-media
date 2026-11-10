import React from "react";
import { BarChart3, Info } from "lucide-react";

const CHANNEL_LABELS = {
  paid: "Paid",
  social: "Social",
  organic: "Organic",
  referral: "Referral",
  internal: "Internal",
  direct: "Direct",
};

// Real recorded traffic and inquiries only. Nothing here estimates, extrapolates or implies a
// search ranking or an advertising result.
export default function PropertyPerformancePanel({ performance, tier }) {
  if (!performance) return null;
  const channels = Object.entries(performance.views_by_channel || {});
  const leads = Object.entries(performance.inquiries_by_channel || {});
  const maxViews = Math.max(1, ...channels.map(([, value]) => Number(value) || 0));

  return (
    <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-serif text-lg text-[#1A1A1A]">
          <BarChart3 className="h-4 w-4 text-[#B8956A]" /> Performance
        </h3>
        <span className="text-[11px] text-[#1A1A1A]/45">
          {performance.window?.start} → {performance.window?.end}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-[#FFFBF5] p-3">
          <p className="font-serif text-2xl text-[#1A1A1A]">{performance.views}</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/50">Page views</p>
        </div>
        <div className="rounded-xl bg-[#FFFBF5] p-3">
          <p className="font-serif text-2xl text-[#1A1A1A]">{performance.inquiries}</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/50">Inquiries</p>
        </div>
        <div className="rounded-xl bg-[#FFFBF5] p-3">
          <p className="font-serif text-2xl text-[#1A1A1A]">{performance.conversion_rate}%</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/50">Inquiry rate</p>
        </div>
      </div>

      {channels.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/45">Where the visits came from</p>
          <div className="mt-2 space-y-1.5">
            {channels.map(([channel, value]) => (
              <div key={channel} className="flex items-center gap-3">
                <span className="w-20 text-xs text-[#1A1A1A]/60">{CHANNEL_LABELS[channel] || channel}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#1A1A1A]/8">
                  <div className="h-full rounded-full bg-[#B8956A]" style={{ width: `${Math.round((Number(value) / maxViews) * 100)}%` }} />
                </div>
                <span className="w-8 text-right text-xs text-[#1A1A1A]/60">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {leads.length > 0 && (
        <p className="mt-3 text-xs text-[#1A1A1A]/55">
          Inquiries by source: {leads.map(([channel, value]) => `${CHANNEL_LABELS[channel] || channel} ${value}`).join(" · ")}
        </p>
      )}

      {tier === "pro" && (performance.weekly || []).length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/45">Weekly</p>
          <div className="mt-2 overflow-hidden rounded-xl border border-[#B8956A]/20">
            <table className="w-full text-xs">
              <thead className="bg-[#FFFBF5] text-[#1A1A1A]/50">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Week of</th>
                  <th className="px-3 py-1.5 text-right font-medium">Views</th>
                  <th className="px-3 py-1.5 text-right font-medium">Inquiries</th>
                </tr>
              </thead>
              <tbody>
                {performance.weekly.map((week) => (
                  <tr key={week.week_start} className="border-t border-[#B8956A]/12">
                    <td className="px-3 py-1.5 text-[#1A1A1A]/70">{week.week_start}</td>
                    <td className="px-3 py-1.5 text-right text-[#1A1A1A]/70">{week.views}</td>
                    <td className="px-3 py-1.5 text-right text-[#1A1A1A]/70">{week.inquiries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-4 flex gap-2 rounded-xl bg-[#FFFBF5] p-3 text-[11px] leading-relaxed text-[#1A1A1A]/55">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B8956A]" />
        <span>
          These are the page views and inquiries Arriv actually recorded. Search impressions, keyword rankings and advertising
          results are not shown because no advertising provider is connected, and we never estimate them.
        </span>
      </p>
    </div>
  );
}