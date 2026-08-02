import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, DollarSign, Percent, Gift } from "lucide-react";

export default function TotalCompensationPanel({ salesMemberId }) {
  const [comp, setComp] = useState(null);
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!salesMemberId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageBenefits", {
        action: "get_total_compensation",
        sales_member_id: salesMemberId,
      });
      const data = res.data || res;
      setComp(data.compensation);
      setSource(data.source);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [salesMemberId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <div className="p-6 text-center text-slate-400">Loading compensation...</div>;
  }

  if (!comp) {
    return <div className="p-6 text-center text-slate-400">Unable to load compensation.</div>;
  }

  const total = (comp.base_salary || 0) + (comp.estimated_annual_commission || 0) + (comp.benefits_value || 0);

  const rows = [
    {
      icon: DollarSign,
      label: "Base Salary",
      value: comp.base_salary || 0,
      show: comp.compensation_type === "base_plus_commission" || comp.compensation_type === "salary",
    },
    {
      icon: Percent,
      label: "Commission Rate",
      value: comp.commission_rate || 0,
      isPercent: true,
      show: comp.compensation_type !== "salary",
    },
    {
      icon: TrendingUp,
      label: "Est. Annual Commission",
      value: comp.estimated_annual_commission || 0,
      show: comp.compensation_type !== "salary",
    },
    {
      icon: Gift,
      label: "Benefits Value",
      value: comp.benefits_value || 0,
      show: true,
    },
  ].filter((r) => r.show);

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-[#B8956A]" />
        <h2 className="text-lg font-semibold text-slate-900">Total Compensation</h2>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">{row.label}</span>
              </div>
              <span className="text-sm font-semibold text-slate-900">
                {row.isPercent ? `${(row.value * 100).toFixed(1)}%` : `$${row.value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">Total Estimated Value</span>
        <span className="text-lg font-bold text-[#B8956A]">
          ${total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </span>
      </div>

      {source === "local" && (
        <p className="text-xs text-slate-400 mt-2">Estimates based on local data. Connect with Arriv Payroll for full details.</p>
      )}
    </div>
  );
}