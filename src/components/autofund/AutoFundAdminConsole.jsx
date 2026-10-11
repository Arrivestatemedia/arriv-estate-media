import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Loader2, AlertTriangle, CheckCircle2, Calendar } from "lucide-react";

/** Admin-only console: the financial stress test and every subscription. */
export default function AutoFundAdminConsole({ catalog = [] }) {
  const [loading, setLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list");

  useEffect(() => { loadSubscriptions(); }, []);

  const loadSubscriptions = async () => {
    try {
      const res = await base44.functions.invoke("manageAutoFund", { action: "list_subscriptions" });
      const data = res?.data || res;
      setSubscriptions(data?.subscriptions || []);
    } catch (e) { /* admin panel; surface on action instead */ }
  };

  const loadSubDetail = async (subId) => {
    try {
      const res = await base44.functions.invoke("manageAutoFund", { action: "get_subscription", subscription_id: subId });
      setSelectedSub(res?.data || res);
      setView("detail");
    } catch (e) { setError(e?.response?.data?.error || e.message); }
  };

  const handleAction = async (action, subId, extra = {}) => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke("manageAutoFund", { action, subscription_id: subId, ...extra });
      const data = res?.data || res;
      if (data?.error) setError(data.error);
      else { loadSubscriptions(); loadSubDetail(subId); }
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  const runStressTest = async () => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke("runAutoFundStressTest", {});
      setResult(res?.data || res); setView("stress");
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={runStressTest} disabled={loading}
          className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-2" />}
          Run financial stress test
        </Button>
        {view !== "list" && (
          <Button variant="ghost" onClick={() => { setView("list"); setSelectedSub(null); setResult(null); }}
            className="text-[#1A1A1A]/60">Back to list</Button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {view === "stress" && result && (
        <Card className="border-[#B8956A]/20 bg-white">
          <CardHeader><CardTitle className="text-[#1A1A1A]">Auto-Fund Financial Certification</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className={`p-4 rounded-lg ${result.status === 'PASS' ? 'bg-[#B8956A]/10 border border-[#B8956A]/30' : 'bg-amber-50 border border-amber-200'}`}>
              <p className="font-medium text-[#1A1A1A]">Status: {result.status}</p>
              <p className="text-sm text-[#1A1A1A]/70 mt-1">
                {result.combinations_tested} combinations over {result.months_simulated} months · target margin {result.assumptions?.target_contribution_margin_pct}%
              </p>
              <p className="text-xs text-[#1A1A1A]/55 mt-1">
                Below target: {result.flagged_scenarios?.below_target_margin?.count ?? 0} · Negative: {result.flagged_scenarios?.negative_contribution?.count ?? 0} · Negative after obligations: {result.flagged_scenarios?.negative_after_obligations?.count ?? 0}
              </p>
            </div>

            {result.tier_ladder && (
              <div>
                <p className="text-sm font-medium text-[#1A1A1A] mb-2">Tier Ladder</p>
                <div className="space-y-1.5">
                  {result.tier_ladder.map(t => (
                    <div key={t.amount} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-[#B8956A]/15 text-sm">
                      <span className="text-[#1A1A1A]">${t.amount}/mo</span>
                      <span className="text-[#1A1A1A]/55">{t.bonus_pct}%</span>
                      <span className="font-medium text-[#1A1A1A]">${t.booking_value} BV</span>
                      {t.vip && <Badge className="bg-[#B8956A] text-[#1A1A1A]">VIP</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.worst_margin && (
              <div className="p-4 rounded-lg bg-[#B8956A]/5">
                <p className="text-sm font-medium text-[#1A1A1A] mb-2">Thinnest Scenario</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-[#1A1A1A]/50">Tier:</span> ${result.worst_margin.amount}/mo</div>
                  <div><span className="text-[#1A1A1A]/50">Margin:</span> {result.worst_margin.margin_pct}%</div>
                  <div className="col-span-2"><span className="text-[#1A1A1A]/50">Scenario:</span> {result.worst_margin.scenario}</div>
                  <div><span className="text-[#1A1A1A]/50">Contribution:</span> ${result.worst_margin.contribution}</div>
                  <div><span className="text-[#1A1A1A]/50">After obligations:</span> ${result.worst_margin.contribution_after_obligations}</div>
                </div>
              </div>
            )}

            <FlaggedGroups title={`Below ${result.assumptions?.target_contribution_margin_pct}% Target Margin`} data={result.flagged_scenarios?.below_target_margin} tone="amber" />
            <FlaggedGroups title="Negative Contribution" data={result.flagged_scenarios?.negative_contribution} tone="red" />
            <FlaggedGroups title="Negative After Funding Obligations" data={result.flagged_scenarios?.negative_after_obligations} tone="red" />

            {result.integrity_checks && (
              <div className="p-3 rounded-lg bg-[#B8956A]/5">
                <p className="text-sm font-medium text-[#1A1A1A]">Integrity: {result.integrity_passed ? 'passed' : 'review required'}</p>
                <p className="text-xs text-[#1A1A1A]/60 mt-1">
                  Consideration mismatches {result.integrity_checks.total_consideration_mismatches} · Duplicate payouts {result.integrity_checks.duplicate_payout_events} · Duplicate editing {result.integrity_checks.duplicate_editing_charges}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {view === "detail" && selectedSub && (
        <Card className="border-[#B8956A]/20 bg-white">
          <CardHeader>
            <CardTitle className="text-[#1A1A1A]">
              {selectedSub.subscription?.customer_name || selectedSub.subscription?.customer_email}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <Fact label="Amount" value={`$${selectedSub.subscription?.amount}/mo`} />
              <Fact label="Membership fee" value={`$${selectedSub.subscription?.membership_fee || 0}`} />
              <Fact label="Next Booking Value" value={`$${selectedSub.subscription?.next_booking_value}`} />
              <Fact label="Wallet balance" value={`$${selectedSub.wallet?.booking_value_balance || 0}`} />
            </div>

            {selectedSub.subscription?.next_billing_date && (
              <p className="flex items-center gap-2 mb-4 text-sm text-[#1A1A1A]/70">
                <Calendar className="w-4 h-4 text-[#B8956A]" />
                Next funding: {new Date(selectedSub.subscription.next_billing_date).toLocaleDateString()}
              </p>
            )}

            <div className="flex flex-wrap gap-2 mb-5">
              {selectedSub.subscription?.status === 'active' && (
                <Button variant="outline" size="sm" onClick={() => handleAction('pause', selectedSub.subscription.id)} disabled={loading} className="border-[#B8956A]/30">Pause</Button>
              )}
              {selectedSub.subscription?.status === 'paused' && (
                <Button variant="outline" size="sm" onClick={() => handleAction('resume', selectedSub.subscription.id)} disabled={loading} className="border-[#B8956A]/30">Resume</Button>
              )}
              <Button variant="outline" size="sm" disabled={loading} className="border-[#B8956A]/30"
                onClick={() => {
                  const amt = prompt(`New monthly amount (${catalog.map(t => t.amount).join(', ')}):`);
                  if (amt) handleAction('change_amount', selectedSub.subscription.id, { new_amount: parseInt(amt) });
                }}>Change amount</Button>
              <Button variant="outline" size="sm" disabled={loading} className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => { if (confirm('Cancel Auto-Fund? Existing wallet value is preserved.')) handleAction('cancel', selectedSub.subscription.id); }}>
                Cancel
              </Button>
            </div>

            <p className="text-sm font-medium text-[#1A1A1A] mb-2">Billing history</p>
            <div className="space-y-2">
              {(selectedSub.payment_history || []).map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[#B8956A]/10">
                  <div>
                    <p className="text-sm text-[#1A1A1A]">{p.date ? new Date(p.date).toLocaleDateString() : '—'} — ${p.amount}</p>
                    <p className="text-xs text-[#1A1A1A]/50">{p.booking_value_added > 0 ? `$${p.booking_value_added} BV added` : 'No value added'}</p>
                  </div>
                  <Badge className={p.status === 'succeeded' || p.status === 'retry_succeeded' ? 'bg-[#B8956A] text-[#1A1A1A]' : 'bg-red-500 text-white'}>{p.status}</Badge>
                </div>
              ))}
              {(!selectedSub.payment_history || selectedSub.payment_history.length === 0) && (
                <p className="text-sm text-[#1A1A1A]/40">No billing history yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {view === "list" && (
        <div>
          <p className="text-sm font-medium text-[#1A1A1A] mb-3">Subscriptions ({subscriptions.length})</p>
          {subscriptions.length === 0 ? (
            <p className="text-sm text-[#1A1A1A]/40">No active Auto-Fund subscriptions.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {subscriptions.map(s => (
                <Card key={s.id} className="border-[#B8956A]/20 bg-white cursor-pointer hover:border-[#B8956A]/40" onClick={() => loadSubDetail(s.id)}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-[#1A1A1A]">{s.customer_name || s.customer_email}</span>
                      <Badge className={s.status === 'active' ? 'bg-[#B8956A] text-[#1A1A1A]' : 'bg-amber-500 text-white'}>{s.status}</Badge>
                    </div>
                    <p className="text-sm text-[#1A1A1A]/60">${s.amount}/mo · ${s.booking_value_per_cycle} BV</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="p-3 rounded-lg bg-[#B8956A]/5">
      <p className="text-xs text-[#1A1A1A]/50">{label}</p>
      <p className="text-base font-medium text-[#1A1A1A]">{value}</p>
    </div>
  );
}

function FlaggedGroups({ title, data, tone }) {
  if (!data?.count || !data?.groups?.length) return null;
  return (
    <div>
      <p className="text-sm font-medium text-[#1A1A1A] mb-2">{title} ({data.count})</p>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {data.groups.map((g, i) => (
          <div key={i} className={`p-2.5 rounded-lg border ${tone === 'red' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
            <p className="text-xs font-medium text-[#1A1A1A]">${g.amount}/mo · {g.scenario}{g.vip_tier ? ' · VIP' : ''}</p>
            <div className="mt-1 space-y-0.5">
              {g.runs.map((r, j) => (
                <p key={j} className="text-[11px] text-[#1A1A1A]/65">
                  Margin {r.margin_pct}% · contribution ${r.contribution} · after obligations ${r.contribution_after_obligations}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}