import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, RefreshCw, Pause, Play, XCircle, Plus, Loader2, TrendingUp, AlertTriangle, CheckCircle2, Calendar } from "lucide-react";
import PaymentRecoveryFlow from "@/components/customer/PaymentRecoveryFlow";

const AMOUNT_OPTIONS = [
  { amount: 50, bv: 50, bonus: 0, benefits: ["Customer 360", "Arriv Wallet", "Automatic monthly funding", "Rollover Booking Value"] },
  { amount: 100, bv: 105, bonus: 5, benefits: ["Everything above", "5% monthly bonus Booking Value", "Qualifying free rescheduling"] },
  { amount: 200, bv: 220, bonus: 20, benefits: ["Everything above", "10% monthly bonus Booking Value", "Priority Arriv Assist support"] },
  { amount: 350, bv: 411.25, bonus: 61.25, benefits: ["Everything above", "17.5% monthly bonus Booking Value", "Priority Booking"] },
  { amount: 500, bv: 625, bonus: 125, benefits: ["Everything above", "25% monthly bonus Booking Value", "Priority Processing when capacity allows"] },
  { amount: 1000, bv: 1500, bonus: 500, benefits: ["Everything above", "50% monthly bonus Booking Value", "Eligible Early Access to new Estate Media services"] },
];

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
                <CardTitle className="text-[#1A1A1A]">Auto-Fund Stress Test</CardTitle>
                <Button variant="ghost" onClick={() => { setView("main"); setResult(null); }} className="text-[#1A1A1A]/60">Close</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className={`p-4 rounded-lg mb-4 ${result.status === 'PASS' ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                <p className="font-medium text-[#1A1A1A]">Status: {result.status} — {result.monthly_combinations_tested} monthly + {result.cumulative_combinations_tested} cumulative combinations</p>
                {result.problems_count > 0 && <p className="text-sm text-amber-800 mt-1">{result.problems_count} problems found</p>}
              </div>

              {result.worst_margin && (
                <div className="p-4 rounded-lg bg-[#B8956A]/5 mb-4">
                  <p className="text-sm font-medium text-[#1A1A1A] mb-2">Worst Monthly Margin</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-[#1A1A1A]/50">Amount:</span> ${result.worst_margin.monthly_cash}/mo</div>
                    <div><span className="text-[#1A1A1A]/50">SqFt:</span> {result.worst_margin.sqft_tier}</div>
                    <div><span className="text-[#1A1A1A]/50">Package:</span> {result.worst_margin.package}</div>
                    <div><span className="text-[#1A1A1A]/50">Retained:</span> {result.worst_margin.arriv_retained_pct}%</div>
                  </div>
                </div>
              )}

              {result.benefit_mapping && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-[#1A1A1A] mb-2">Benefit Mapping</p>
                  <div className="space-y-2">
                    {result.benefit_mapping.map(b => (
                      <div key={b.amount} className="p-3 rounded-lg border border-[#B8956A]/15">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-[#1A1A1A]">${b.amount}/mo</span>
                          <Badge className="bg-[#B8956A] text-[#1A1A1A]">{b.support_tier}</Badge>
                        </div>
                        <p className="text-xs text-[#1A1A1A]/60">Priority: {b.support_priority} · Bonus: {b.bonus_pct}% · Promo add-ons: {b.promotional_addon_benefits}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.failed_payment_tests && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-[#1A1A1A] mb-2">Failed Payment Handling</p>
                  <div className="space-y-1">
                    {result.failed_payment_tests.map(t => (
                      <div key={t.amount} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-[#B8956A]" />
                        <span className="text-[#1A1A1A]">${t.amount}/mo: fail → {t.payment_fails.credits_issued} credits, {t.payment_fails.commission} commission. Wallet preserved: {String(t.payment_fails.wallet_preserved)}</span>
                      </div>
                    ))}
                  </div>
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
                      {opt.bonus > 0 && <Badge className="bg-[#B8956A] text-[#1A1A1A]">+{opt.bonus}% bonus</Badge>}
                    </div>
                    <p className="text-sm text-[#1A1A1A]/60 mb-3">${opt.bv} Booking Value every month</p>
                    <ul className="space-y-1.5">
                      {opt.benefits.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-[#1A1A1A]/70">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#B8956A] mt-0.5 shrink-0" />{b}
                        </li>
                      ))}
                    </ul>
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