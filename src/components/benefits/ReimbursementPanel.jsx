import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Wallet, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReimbursementPanel({ salesMemberId }) {
  const [reimbursements, setReimbursements] = useState(null);
  const [portalUrl, setPortalUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!salesMemberId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageBenefits", {
        action: "get_reimbursements",
        sales_member_id: salesMemberId,
      });
      const data = res.data || res;
      setReimbursements(data.reimbursements);
      setPortalUrl(data.benefits_portal_url || "");
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [salesMemberId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <div className="p-6 text-center text-slate-400">Loading reimbursement accounts...</div>;
  }

  if (!reimbursements || !reimbursements.accounts || reimbursements.accounts.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#B8956A]" />
            <h2 className="text-lg font-semibold text-slate-900">Reimbursement Accounts</h2>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">No reimbursement accounts (HSA, FSA, etc.) found. Visit the benefits portal to enroll.</p>
        {portalUrl && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => window.open(portalUrl, "_blank")}>
            <ExternalLink className="w-4 h-4" /> Benefits Portal
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-[#B8956A]" />
          <h2 className="text-lg font-semibold text-slate-900">Reimbursement Accounts</h2>
        </div>
        {portalUrl && (
          <Button variant="outline" size="sm" onClick={() => window.open(portalUrl, "_blank")}>
            <ExternalLink className="w-4 h-4" /> Portal
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {reimbursements.accounts.map((acct, i) => (
          <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-900">{acct.account_type || acct.name || "Account"}</span>
              {acct.contribution_limit && (
                <span className="text-xs text-slate-400">Limit: ${acct.contribution_limit.toLocaleString()}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-slate-400">Available</p>
                <p className="text-sm font-semibold text-slate-900">${(acct.available || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">YTD Used</p>
                <p className="text-sm font-semibold text-slate-900">${(acct.ytd_used || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
        <span className="text-sm text-slate-500">Total Available</span>
        <span className="text-sm font-bold text-[#B8956A]">${(reimbursements.total_available || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}