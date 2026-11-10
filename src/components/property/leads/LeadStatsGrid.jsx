import React from "react";
import { Inbox, Mail, AlertTriangle, Eye } from "lucide-react";

// The four figures that matter on this screen: how many leads arrived, how many actually reached the
// listing contact, how many are stuck, and how much traffic produced them.
export default function LeadStatsGrid({ totals }) {
  const delivered = Math.max(0, (totals?.leads_total || 0) - (totals?.leads_pending || 0) - (totals?.leads_failed || 0));
  const items = [
    { label: "Leads captured", value: totals?.leads_total || 0, hint: "Inquiries on your property pages", icon: Inbox },
    { label: "Emailed to you", value: delivered, hint: "Delivered to the listing contact", icon: Mail },
    {
      label: "Delivery failed",
      value: totals?.leads_failed || 0,
      hint: (totals?.leads_failed || 0) > 0 ? "Stored, resend from the list below" : "Nothing needs attention",
      icon: AlertTriangle,
      alert: (totals?.leads_failed || 0) > 0,
    },
    { label: "Page views, 30 days", value: totals?.views_30d || 0, hint: "Measured on the public page", icon: Eye },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-2xl border border-[#B8956A]/25 bg-white p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#1A1A1A]/45">{item.label}</span>
              <Icon className={`w-4 h-4 ${item.alert ? "text-red-600" : "text-[#B8956A]"}`} />
            </div>
            <p className="text-2xl font-serif text-[#1A1A1A]">{item.value}</p>
            <p className={`text-[11px] mt-1 ${item.alert ? "text-red-600" : "text-[#1A1A1A]/45"}`}>{item.hint}</p>
          </div>
        );
      })}
    </div>
  );
}