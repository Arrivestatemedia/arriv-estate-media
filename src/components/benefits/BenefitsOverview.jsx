import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Shield, Heart, Users, DollarSign, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BenefitsOverview({ salesMemberId }) {
  const [overview, setOverview] = useState(null);
  const [portalUrl, setPortalUrl] = useState("");
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!salesMemberId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageBenefits", {
        action: "get_overview",
        sales_member_id: salesMemberId,
      });
      const data = res.data || res;
      setOverview(data.overview);
      setPortalUrl(data.benefits_portal_url || "");
      setSource(data.source);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [salesMemberId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <div className="p-6 text-center text-slate-400">Loading benefits overview...</div>;
  }

  if (!overview) {
    return <div className="p-6 text-center text-slate-400">Unable to load benefits.</div>;
  }

  const isEnrolled = overview.enrollment_status === "enrolled" || overview.enrollment_status === "active";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#B8956A]" />
          <h2 className="text-lg font-semibold text-slate-900">Benefits Overview</h2>
        </div>
        {portalUrl && (
          <Button variant="outline" size="sm" onClick={() => window.open(portalUrl, "_blank")}>
            <ExternalLink className="w-4 h-4" /> Benefits Portal
          </Button>
        )}
      </div>

      {source === "local" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700">
            Showing local data — Arriv Payroll benefits sync is not available. Contact HR if your benefits seem incorrect.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className={`w-4 h-4 ${isEnrolled ? "text-green-600" : "text-slate-400"}`} />
            <span className="text-xs font-medium text-slate-500">Enrollment Status</span>
          </div>
          <p className="text-sm font-semibold text-slate-900 capitalize">
            {overview.enrollment_status?.replace(/_/g, " ") || "Not enrolled"}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-[#B8956A]" />
            <span className="text-xs font-medium text-slate-500">Deductions</span>
          </div>
          <p className="text-sm font-semibold text-slate-900">
            ${(overview.deductions?.per_paycheck || 0).toFixed(2)}<span className="text-xs text-slate-400"> / paycheck</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">${(overview.deductions?.annual || 0).toFixed(2)} / year</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-[#B8956A]" />
            <span className="text-xs font-medium text-slate-500">Dependents</span>
          </div>
          <p className="text-sm font-semibold text-slate-900">{(overview.dependents || []).length} enrolled</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-4 h-4 text-[#B8956A]" />
            <span className="text-xs font-medium text-slate-500">Beneficiaries</span>
          </div>
          <p className="text-sm font-semibold text-slate-900">{(overview.beneficiaries || []).length} on file</p>
        </div>
      </div>

      {overview.plan_summary && Object.keys(overview.plan_summary).length > 0 && (
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Plan Summary</h3>
          <div className="space-y-2">
            {Object.entries(overview.plan_summary).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-slate-500 capitalize">{key.replace(/_/g, " ")}</span>
                <span className="text-slate-900 font-medium">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}