import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, RefreshCw, Pause, Play, XCircle, Plus, Loader2, TrendingUp, AlertTriangle, CheckCircle2, Calendar } from "lucide-react";
import PaymentRecoveryFlow from "@/components/customer/PaymentRecoveryFlow";

// Approved Auto-Fund ladder. `bonus` is bonus Booking Value in dollars;
// `bonusPct` is the published bonus percentage — the two differ, so the
// percentage is never derived from the dollar amount in the display.
const AMOUNT_OPTIONS = [
  { amount: 50, bv: 50, bonus: 0, bonusPct: 0, benefits: ["Customer 360", "Arriv Wallet", "Automatic monthly funding", "Rollover Booking Value"] },
  { amount: 100, bv: 105, bonus: 5, bonusPct: 5, benefits: ["Everything above", "5% monthly bonus Booking Value", "Qualifying free rescheduling"] },
  { amount: 200, bv: 220, bonus: 20, bonusPct: 10, benefits: ["Everything above", "10% monthly bonus Booking Value", "Priority Arriv Assist support"] },
  { amount: 350, bv: 402.50, bonus: 52.50, bonusPct: 15, benefits: ["Everything above", "15% monthly bonus Booking Value", "Priority Booking"] },
  { amount: 500, bv: 600, bonus: 100, bonusPct: 20, benefits: ["Everything above", "20% monthly bonus Booking Value", "Priority Processing when capacity allows"] },
  {
    amount: 1000, bv: 1250, bonus: 250, bonusPct: 25, vip: true,
    benefits: [
      "Everything above",
      "25% monthly bonus Booking Value",
      "VIP priority scheduling, subject to specialist availability",
      "VIP Arriv Assist routing",
      "VIP highest-priority human-support escalation",
      "Preferred pricing on selected add-ons when margin requirements are met",
    ],
  },
];

// Full VIP terms — every limit is disclosed to the customer before enrollment.
const VIP_DISCLOSURE = [
  "Priority scheduling: your booking request is sequenced ahead of standard requests in the scheduling queue, subject to specialist availability. It does not guarantee a specific date, time, or specialist, and does not guarantee a faster delivery turnaround.",
  "Enhanced support: Arriv Assist routing is prioritised and human-support escalation carries the highest priority available on the support queue during business hours. It does not provide a dedicated agent, a guaranteed response time, or 24/7 coverage.",
  "Preferred add-on pricing: 10% off selected add-ons, capped at $25 per booking, applied only when the discounted price still meets Arriv's required contribution margin. Add-ons that cannot meet the margin receive no discount. Not cumulative with other add-on promotions.",
];

const VIP_EXCLUSIONS = [
  "No guaranteed turnaround times.",
  "No unlimited revisions.",
  "No complimentary services.",
  "No uncapped discounts.",
];

function FlaggedGroups({ title, data, tone }) {
  if (!data?.count || !data?.groups?.length) return null;
  const toneClass = tone === 'red' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50';
  return (
    <div>
      <p className="text-sm font-medium text-[#1A1A1A] mb-2">{title} ({data.count})</p>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {data.groups.map((g, i) => (
          <div key={i} className={`p-2.5 rounded-lg border ${toneClass}`}>
            <p className="text-xs font-medium text-[#1A1A1A]">
              ${g.amount}/mo · {g.scenario}{g.vip_tier ? ' · VIP' : ''}
            </p>
            <div className="mt-1 space-y-0.5">
              {g.runs.map((r, j) => (
                <p key={j} className="text-[11px] text-[#1A1A1A]/65">
                  Premium editing ${r.premium_editing}: margin {r.margin_pct}% · contribution ${r.contribution} · after obligations ${r.contribution_after_obligations}
                  {r.vip_incremental_cost > 0 ? ` · VIP cost $${r.vip_incremental_cost}` : ''}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VipTerms() {
  return (
    <div className="mt-3 pt-3 border-t border-[#B8956A]/20">
      <p className="text-xs font-medium text-[#1A1A1A] mb-2">VIP terms</p>
      <ul className="space-y-2">
        {VIP_DISCLOSURE.map((t, i) => (
          <li key={i} className="text-[11px] leading-relaxed text-[#1A1A1A]/60">{t}</li>
        ))}
      </ul>
      <div className="mt-2 space-y-0.5">
        {VIP_EXCLUSIONS.map((e, i) => (
          <p key={i} className="text-[11px] text-[#1A1A1A]/45">{e}</p>
        ))}
      </div>
    </div>
  );
}

export default function AutoFund() {
  const [loading, setLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [showEnroll, setShowEnroll] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState("main");

  // Recovery flow: detect recovery_token or recovery=success from URL
  const [recoveryToken, setRecoveryToken] = useState(null);
  const [stripeSessionId, setStripeSessionId] = useState(null);
  const [recoveryStatus, setRecoveryStatus] = useState(null);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("recovery_token");
    const sessionId = params.get("session_id");
    const status = params.get("recovery");
    if (token) setRecoveryToken(token);
    if (sessionId) setStripeSessionId(sessionId);
    if (status) setRecoveryStatus(status);
  }, []);

  useEffect(() => { loadSubscriptions(); }, []);

  const loadSubscriptions = async () => {
    try {
      const res = await base44.functions.invoke("manageAutoFund", { action: "list_subscriptions" });
      const data = res?.data || res;
      setSubscriptions(data?.subscriptions || []);
    } catch (e) {}
  };

  const handleEnroll = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await base44.functions.invoke("manageAutoFund", {
        action: "enroll",
        customer_email: customerEmail,
        customer_name: customerName,
        customer_phone: customerPhone,
        amount: selectedAmount,
        sales_rep_id: salesRepId || undefined,
      });
      const data = res?.data || res;
      if (data?.status === 'success') { setResult(data); loadSubscriptions(); setShowEnroll(false); setSelectedAmount(null); }
      else setError(data?.error || 'Enrollment failed');
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  const handleAction = async (action, subId, extra = {}) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await base44.functions.invoke("manageAutoFund", { action, subscription_id: subId, ...extra });
      const data = res?.data || res;
      if (data?.status === 'success') { setResult(data); loadSubscriptions(); if (selectedSub) loadSubDetail(subId); }
      else setError(data?.error || `${action} failed`);
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };

  const loadSubDetail = async (subId) => {
    try {
      const res = await base44.functions.invoke("manageAutoFund", { action: "get_subscription", subscription_id: subId });
      const data = res?.data || res;
      setSelectedSub(data); setView("detail");
    } catch (e) { setError(e?.response?.data?.error || e.message); }
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
    <div className="min-h-screen bg-[#FFFBF5] py-8 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif text-[#1A1A1A] flex items-center gap-3">
              <RefreshCw className="w-7 h-7 text-[#B8956A]" />
              Arriv Auto-Fund
            </h1>
            <p className="text-sm text-[#1A1A1A]/60 mt-1">Automatically add Booking Value to your Arriv Wallet every month</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={runStressTest} disabled={loading} className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10">
              <TrendingUp className="w-4 h-4 mr-2" /> Stress Test
            </Button>
            <Button onClick={() => { setShowEnroll(!showEnroll); setResult(null); setError(null); }} className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
              <Plus className="w-4 h-4 mr-2" /> Enroll
            </Button>
          </div>
        </div>

        {/* Customer-facing payment recovery flow */}
        {recoveryToken && !recoveryDismissed && (
          <div className="mb-8">
            <PaymentRecoveryFlow
              recoveryToken={recoveryToken}
              stripeSessionId={stripeSessionId}
              recoveryStatus={recoveryStatus}
              onDismiss={() => {
                setRecoveryDismissed(true);
                // Clean URL params
                const url = new URL(window.location.href);
                url.searchParams.delete("recovery_token");
                url.searchParams.delete("session_id");
                url.searchParams.delete("recovery");
                window.history.replaceState({}, "", url.toString());
                loadSubscriptions();
              }}
            />
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {result && view !== "stress" && (
          <div className="mb-6 p-5 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/30">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-5 h-5 text-[#B8956A]" />
              <span className="font-medium text-[#1A1A1A]">Success</span>
            </div>
            <p className="text-sm text-[#1A1A1A]/70">{result.message || JSON.stringify(result).slice(0, 200)}</p>
          </div>
        )}

        {showEnroll && (
          <Card className="mb-8 border-[#B8956A]/20 bg-white">
            <CardHeader><CardTitle className="text-[#1A1A1A]">Enroll in Auto-Fund</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><Label className="text-[#1A1A1A]">Customer Email *</Label><Input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="client@email.com" className="mt-1" /></div>
                <div><Label className="text-[#1A1A1A]">Customer Name</Label><Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="John Smith" className="mt-1" /></div>
                <div><Label className="text-[#1A1A1A]">Customer Phone</Label><Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="555-123-4567" className="mt-1" /></div>
              </div>
              <div><Label className="text-[#1A1A1A]">Sales Rep ID (optional)</Label><Input value={salesRepId} onChange={e => setSalesRepId(e.target.value)} placeholder="SalesTeamMember ID" className="mt-1" /></div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
                {AMOUNT_OPTIONS.map(opt => (
                  <div key={opt.amount} onClick={() => setSelectedAmount(opt.amount)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedAmount === opt.amount ? 'border-[#B8956A] bg-[#B8956A]/5' : 'border-[#B8956A]/15 hover:border-[#B8956A]/40'}`}>
                    <p className="text-lg font-bold text-[#1A1A1A]">${opt.amount}</p>
                    <p className="text-xs text-[#1A1A1A]/60">${opt.bv} BV{opt.bonus > 0 && ` (+$${opt.bonus})`}</p>
                    {opt.vip && <p className="text-[10px] font-medium text-[#B8956A] mt-1">VIP</p>}
                  </div>
                ))}
              </div>

              {selectedAmount && (
                <div className="p-3 rounded-lg bg-[#B8956A]/5">
                  <p className="text-sm font-medium text-[#1A1A1A] mb-1">${selectedAmount}/month includes:</p>
                  <ul className="space-y-1">
                    {AMOUNT_OPTIONS.find(o => o.amount === selectedAmount)?.benefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#1A1A1A]/70">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#B8956A] mt-0.5 shrink-0" />{b}
                      </li>
                    ))}
                  </ul>
                  {selectedAmount === 1000 && <VipTerms />}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleEnroll} disabled={loading || !customerEmail || !selectedAmount} className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Enroll ${selectedAmount || ''}/month
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {view === "detail" && selectedSub && (
          <Card className="mb-8 border-[#B8956A]/20 bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#1A1A1A]">Auto-Fund — {selectedSub.subscription?.customer_name || selectedSub.subscription?.customer_email}</CardTitle>
                <Button variant="ghost" onClick={() => { setView("main"); setSelectedSub(null); }} className="text-[#1A1A1A]/60">Back</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="p-3 rounded-lg bg-[#B8956A]/5"><p className="text-xs text-[#1A1A1A]/50">Amount</p><p className="text-lg font-medium text-[#1A1A1A]">${selectedSub.subscription?.amount}/mo</p></div>
                <div className="p-3 rounded-lg bg-[#B8956A]/5"><p className="text-xs text-[#1A1A1A]/50">Next Booking Value</p><p className="text-lg font-medium text-[#1A1A1A]">${selectedSub.subscription?.next_booking_value}</p></div>
                <div className="p-3 rounded-lg bg-[#B8956A]/5"><p className="text-xs text-[#1A1A1A]/50">Status</p><Badge className={selectedSub.subscription?.status === 'active' ? 'bg-green-600 text-white' : selectedSub.subscription?.status === 'paused' ? 'bg-amber-500 text-white' : 'bg-gray-400 text-white'}>{selectedSub.subscription?.status}</Badge></div>
                <div className="p-3 rounded-lg bg-[#B8956A]/5"><p className="text-xs text-[#1A1A1A]/50">Wallet Balance</p><p className="text-lg font-medium text-[#1A1A1A]">${selectedSub.wallet?.booking_value_balance || 0}</p></div>
              </div>

              {selectedSub.subscription?.next_billing_date && (
                <div className="flex items-center gap-2 mb-4 text-sm text-[#1A1A1A]/70">
                  <Calendar className="w-4 h-4 text-[#B8956A]" />
                  Next funding: {new Date(selectedSub.subscription.next_billing_date).toLocaleDateString()}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mb-6">
                {selectedSub.subscription?.status === 'active' && (
                  <Button variant="outline" size="sm" onClick={() => handleAction('pause', selectedSub.subscription.id)} disabled={loading} className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10">
                    <Pause className="w-3.5 h-3.5 mr-1" /> Pause
                  </Button>
                )}
                {selectedSub.subscription?.status === 'paused' && (
                  <Button variant="outline" size="sm" onClick={() => handleAction('resume', selectedSub.subscription.id)} disabled={loading} className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10">
                    <Play className="w-3.5 h-3.5 mr-1" /> Resume
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => { const amt = prompt('New monthly amount (50, 100, 200, 350, 500, 1000):'); if (amt) handleAction('change_amount', selectedSub.subscription.id, { new_amount: parseInt(amt) }); }} disabled={loading} className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10">
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Change Amount
                </Button>
                <Button variant="outline" size="sm" onClick={() => { const pid = prompt('Arriv Pay payment_event_id:'); const amt = prompt('Top-up amount:'); if (pid && amt) handleAction('topup', selectedSub.subscription.id, { payment_event_id: pid, amount: parseFloat(amt) }); }} disabled={loading} className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Funds
                </Button>
                <Button variant="outline" size="sm" onClick={() => { if (confirm('Cancel Auto-Fund? Existing wallet value is preserved.')) handleAction('cancel', selectedSub.subscription.id); }} disabled={loading} className="border-red-300 text-red-600 hover:bg-red-50">
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel Auto-Fund
                </Button>
              </div>

              {/* Payment History */}
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-2">Payment History</h3>
              <div className="space-y-2">
                {selectedSub.payment_history?.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-[#B8956A]/10">
                    <div className="flex items-center gap-3">
                      <Badge className={p.status === 'succeeded' || p.status === 'retry_succeeded' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}>
                        {p.status}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium text-[#1A1A1A]">{new Date(p.date).toLocaleDateString()} — ${p.amount}</p>
                        <p className="text-xs text-[#1A1A1A]/50">{p.event_type} — {p.booking_value_added > 0 ? `$${p.booking_value_added} BV added` : 'No value added'}</p>
                      </div>
                    </div>
                    {p.failure_reason && <span className="text-xs text-red-600">{p.failure_reason}</span>}
                  </div>
                ))}
                {(!selectedSub.payment_history || selectedSub.payment_history.length === 0) && (
                  <p className="text-sm text-[#1A1A1A]/40">No payment history yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {view === "stress" && result && (
          <Card className="mb-8 border-[#B8956A]/20 bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#1A1A1A]">Auto-Fund Financial Certification</CardTitle>
                <Button variant="ghost" onClick={() => { setView("main"); setResult(null); }} className="text-[#1A1A1A]/60">Close</Button>
              </div>
            </CardHeader>
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
                    <div><span className="text-[#1A1A1A]/50">Premium editing:</span> ${result.worst_margin.premium_editing}</div>
                    <div><span className="text-[#1A1A1A]/50">Contribution:</span> ${result.worst_margin.contribution}</div>
                    <div><span className="text-[#1A1A1A]/50">Unredeemed BV:</span> ${result.worst_margin.unredeemed_bv}</div>
                    <div><span className="text-[#1A1A1A]/50">After obligations:</span> ${result.worst_margin.contribution_after_obligations}</div>
                  </div>
                </div>
              )}

              <FlaggedGroups
                title={`Below ${result.assumptions?.target_contribution_margin_pct}% Target Margin`}
                data={result.flagged_scenarios?.below_target_margin}
                tone="amber"
              />

              <FlaggedGroups
                title="Negative Contribution"
                data={result.flagged_scenarios?.negative_contribution}
                tone="red"
              />

              <FlaggedGroups
                title="Negative After Funding Obligations"
                data={result.flagged_scenarios?.negative_after_obligations}
                tone="red"
              />

              {result.vip_cost_sensitivity?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A] mb-2">VIP Incremental Cost Sensitivity ($1,000 tier)</p>
                  <div className="space-y-1.5">
                    {result.vip_cost_sensitivity.map(s => (
                      <div key={s.priority_utilisation} className="flex items-center justify-between p-2.5 rounded-lg border border-[#B8956A]/15 text-xs text-[#1A1A1A]/70">
                        <span>Priority used on {Math.round(s.priority_utilisation * 100)}% of bookings</span>
                        <span className="font-medium text-[#1A1A1A]">${s.vip_incremental_cost}/yr</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.integrity_checks && (
                <div className="p-3 rounded-lg bg-[#B8956A]/5">
                  <p className="text-sm font-medium text-[#1A1A1A]">
                    Integrity: {result.integrity_passed ? 'passed' : 'review required'}
                  </p>
                  <p className="text-xs text-[#1A1A1A]/60 mt-1">
                    Consideration mismatches {result.integrity_checks.total_consideration_mismatches} · Duplicate payouts {result.integrity_checks.duplicate_payout_events} · Duplicate editing {result.integrity_checks.duplicate_editing_charges} · Blocked redemptions {result.integrity_checks.redemptions_blocked}
                  </p>
                </div>
              )}

              {result.idempotency_test && (
                <div className="p-3 rounded-lg bg-[#B8956A]/5">
                  <p className="text-sm font-medium text-[#1A1A1A]">Idempotency: {result.idempotency_test.description}</p>
                  <p className="text-xs text-[#1A1A1A]/60 mt-1">{result.idempotency_test.mechanism}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {view === "main" && subscriptions.length > 0 && (
          <div>
            <h2 className="text-xl font-serif text-[#1A1A1A] mb-4">Active Auto-Fund Subscriptions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subscriptions.map(s => (
                <Card key={s.id} className="border-[#B8956A]/20 bg-white cursor-pointer hover:border-[#B8956A]/40 transition-all" onClick={() => loadSubDetail(s.id)}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-[#1A1A1A]">{s.customer_name || s.customer_email}</span>
                      <Badge className={s.status === 'active' ? 'bg-green-600 text-white' : 'bg-amber-500 text-white'}>{s.status}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-[#1A1A1A]/50">Amount:</span> <span className="font-medium text-[#1A1A1A]">${s.amount}/mo</span></div>
                      <div><span className="text-[#1A1A1A]/50">BV/cycle:</span> <span className="font-medium text-[#1A1A1A]">${s.booking_value_per_cycle}</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {view === "main" && (
          <div className="mt-8">
            <h2 className="text-xl font-serif text-[#1A1A1A] mb-4">Auto-Fund Amounts</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {AMOUNT_OPTIONS.map(opt => (
                <Card key={opt.amount} className="border-[#B8956A]/20 bg-white">
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-serif text-xl text-[#1A1A1A]">${opt.amount}/month</span>
                      {opt.bonusPct > 0 && <Badge className="bg-[#B8956A] text-[#1A1A1A]">+{opt.bonusPct}% bonus</Badge>}
                    </div>
                    <p className="text-sm text-[#1A1A1A]/60 mb-3">
                      ${opt.bv} Booking Value every month{opt.bonus > 0 ? ` (+$${opt.bonus} bonus)` : ''}
                    </p>
                    <ul className="space-y-1.5">
                      {opt.benefits.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-[#1A1A1A]/70">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#B8956A] mt-0.5 shrink-0" />{b}
                        </li>
                      ))}
                    </ul>
                    {opt.vip && <VipTerms />}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}