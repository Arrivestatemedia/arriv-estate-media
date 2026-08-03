import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Calendar, TrendingUp, FileCheck, Clock, Wallet } from "lucide-react";

export default function PayoutOverview() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await base44.functions.invoke("getPayoutRecords", { action: "get_overview" });
        if (cancelled) return;
        if (res.data?.overview) setOverview(res.data.overview);
        else setError(res.data?.error || "Could not load overview.");
      } catch (e) {
        if (!cancelled) setError(e.message || "Could not load overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="py-6 text-center text-sm text-red-700">{error}</CardContent>
      </Card>
    );
  }

  if (!overview) return null;

  const cards = [
    {
      label: "Total Paid This Year",
      value: `$${(overview.total_paid_this_year || 0).toFixed(2)}`,
      icon: DollarSign,
      sub: "YTD earnings",
    },
    {
      label: "Current Month Earnings",
      value: `$${(overview.current_month_earnings || 0).toFixed(2)}`,
      icon: TrendingUp,
      sub: new Date().toLocaleDateString("en-US", { month: "long" }),
    },
    {
      label: "Pending Payouts",
      value: `$${(overview.pending_payouts || 0).toFixed(2)}`,
      icon: Clock,
      sub: `${overview.pending_payout_count || 0} pending`,
    },
    {
      label: "Last Payout",
      value: overview.last_payout ? `$${(overview.last_payout.amount || 0).toFixed(2)}` : "—",
      icon: Wallet,
      sub: overview.last_payout
        ? new Date(overview.last_payout.payout_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "No payouts yet",
    },
  ];

  const statusCards = [
    {
      label: "W-9 Status",
      value: overview.w9_status === "available" ? "On File" : overview.w9_status === "amended" ? "Amended" : "Not Submitted",
      icon: FileCheck,
      tone: overview.w9_status === "available" ? "good" : "warn",
    },
    {
      label: "Tax Document Status",
      value: overview.tax_document_status === "available" ? "Available" : "Pending",
      icon: FileCheck,
      tone: overview.tax_document_status === "available" ? "good" : "warn",
    },
    {
      label: "Stripe Connect",
      value: overview.stripe_payouts_enabled ? "Enabled" : "Setup Needed",
      icon: Wallet,
      tone: overview.stripe_payouts_enabled ? "good" : "warn",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-[#B8956A]/20 bg-white">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#1A1A1A]/60 uppercase tracking-wide">{c.label}</span>
                  <Icon className="w-4 h-4 text-[#B8956A]" />
                </div>
                <p className="text-xl md:text-2xl font-bold text-[#1A1A1A]">{c.value}</p>
                <p className="text-xs text-[#1A1A1A]/50 mt-1">{c.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {statusCards.map((c) => {
          const Icon = c.icon;
          const tone = c.tone === "good" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-orange-700 bg-orange-50 border-orange-200";
          return (
            <Card key={c.label} className="border-[#B8956A]/20 bg-white">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#1A1A1A]/60 uppercase tracking-wide">{c.label}</span>
                  <Icon className="w-4 h-4 text-[#B8956A]" />
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${tone}`}>
                  {c.value}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}