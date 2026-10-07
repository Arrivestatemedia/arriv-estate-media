import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Sparkles, CheckCircle2, Loader2, TrendingUp, AlertTriangle, ArrowRight, RotateCw } from "lucide-react";

const TIERS = [
  {
    key: "STARTER",
    name: "Starter",
    price: 500,
    credits: 2.0,
    bookingValue: 550,
    validity: "12 months",
    color: "#B8956A",
    benefits: [
      "10% additional booking value",
      "Customer 360 Arriv Wallet",
      "Qualifying free rescheduling",
      "Customer 360-aware Arriv Assist",
    ],
    promo: 0,
  },
  {
    key: "PRO",
    name: "Pro",
    price: 1000,
    credits: 4.0,
    bookingValue: 1100,
    validity: "12 months",
    color: "#B8956A",
    benefits: [
      "10% additional booking value",
      "Customer 360 Arriv Wallet",
      "Qualifying free rescheduling",
      "Priority Booking",
      "Priority Arriv Assist routing",
      "Priority human-support escalation",
    ],
    promo: 0,
  },
  {
    key: "PREMIER",
    name: "Premier",
    price: 2500,
    credits: 10.0,
    bookingValue: 2750,
    validity: "15 months",
    color: "#B8956A",
    benefits: [
      "10% additional booking value",
      "Customer 360 Arriv Wallet",
      "Qualifying free rescheduling",
      "Priority Booking",
      "Priority Processing when capacity allows",
      "Priority Arriv Assist",
      "Higher-priority human escalation",
      "Eligible early access",
      "1 promotional Add-On Benefit per cycle",
    ],
    promo: 1,
  },
  {
    key: "ELITE",
    name: "Elite",
    price: 5000,
    credits: 20.0,
    bookingValue: 5500,
    validity: "18 months",
    color: "#B8956A",
    benefits: [
      "10% additional booking value",
      "Customer 360 Arriv Wallet",
      "Qualifying free rescheduling",
      "Highest prepaid Priority Booking",
      "Priority Processing when capacity allows",
      "VIP Arriv Assist routing",
      "Highest prepaid human-support priority",
      "Eligible early access",
      "2 promotional Add-On Benefits per cycle",
    ],
    promo: 2,
  },
];

export default function PrepaidPurchase() {
  const [loading, setLoading] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [showPurchase, setShowPurchase] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [selectedTier, setSelectedTier] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState("tiers"); // tiers, wallet, stress

  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    try {
      const res = await base44.functions.invoke("managePrepaid", { action: "list_wallets" });
      const data = res?.data || res;
      setWallets(data?.wallets || []);
    } catch (e) {
      // Feature flag may be off — that's OK
    }
  };

  const handlePurchase = async (tierKey) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke("managePrepaid", {
        action: "purchase",
        tier: tierKey,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_phone: customerPhone,
        sales_rep_id: salesRepId || undefined,
      });
      const data = res?.data || res;
      if (data?.status === 'success') {
        setResult(data);
        loadWallets();
        setShowPurchase(false);
        setSelectedTier(null);
      } else {
        setError(data?.error || 'Purchase failed');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Purchase failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async (walletId, tierKey) => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("managePrepaid", {
        action: "reload",
        wallet_id: walletId,
        tier: tierKey,
      });
      const data = res?.data || res;
      if (data?.status === 'success') {
        setResult(data);
        loadWallets();
      } else {
        setError(data?.error || 'Reload failed');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Reload failed');
    } finally {
      setLoading(false);
    }
  };

  const loadWalletDetail = async (walletId) => {
    try {
      const res = await base44.functions.invoke("managePrepaid", {
        action: "get_wallet",
        wallet_id: walletId,
      });
      const data = res?.data || res;
      setSelectedWallet(data);
      setView("wallet");
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const runStressTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("runPrepaidStressTest", {});
      const data = res?.data || res;
      setResult(data);
      setView("stress");
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif text-[#1A1A1A] flex items-center gap-3">
              <Wallet className="w-8 h-8 text-[#B8956A]" />
              Arriv Prepaid
            </h1>
            <p className="text-sm text-[#1A1A1A]/60 mt-1">
              Prepaid packages, wallet credits, and booking value management
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={runStressTest}
              disabled={loading}
              className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Stress Test
            </Button>
            <Button
              onClick={() => { setShowPurchase(!showPurchase); setResult(null); setError(null); }}
              className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              New Purchase
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {result && view !== "stress" && (
          <div className="mb-6 p-5 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/30">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-[#B8956A]" />
              <span className="font-medium text-[#1A1A1A]">
                {result.tier ? `${result.tier} ${result.credits_added ? 'Reload' : 'Purchase'} Complete` : 'Success'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {result.credits !== undefined && (
                <div><span className="text-[#1A1A1A]/50">Credits:</span> <span className="font-medium">{result.credits ?? result.credits_added}</span></div>
              )}
              {result.booking_value !== undefined && (
                <div><span className="text-[#1A1A1A]/50">Booking Value:</span> <span className="font-medium">${result.booking_value ?? result.booking_value_added}</span></div>
              )}
              {result.cash_collected !== undefined && (
                <div><span className="text-[#1A1A1A]/50">Cash:</span> <span className="font-medium">${result.cash_collected}</span></div>
              )}
              {result.expires_at && (
                <div><span className="text-[#1A1A1A]/50">Expires:</span> <span className="font-medium">{new Date(result.expires_at).toLocaleDateString()}</span></div>
              )}
              {result.commission_event && (
                <div><span className="text-[#1A1A1A]/50">Commission:</span> <span className="font-medium">${result.commission_event.commission_amount}</span></div>
              )}
            </div>
          </div>
        )}

        {/* Purchase Form */}
        {showPurchase && (
          <Card className="mb-8 border-[#B8956A]/20 bg-white">
            <CardHeader>
              <CardTitle className="text-[#1A1A1A]">New Prepaid Purchase</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-[#1A1A1A]">Customer Email *</Label>
                  <Input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="client@email.com" className="mt-1" />
                </div>
                <div>
                  <Label className="text-[#1A1A1A]">Customer Name</Label>
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="John Smith" className="mt-1" />
                </div>
                <div>
                  <Label className="text-[#1A1A1A]">Customer Phone</Label>
                  <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="555-123-4567" className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-[#1A1A1A]">Sales Rep ID (optional — for commission attribution)</Label>
                <Input value={salesRepId} onChange={e => setSalesRepId(e.target.value)} placeholder="SalesTeamMember ID" className="mt-1" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                {TIERS.map(tier => (
                  <div
                    key={tier.key}
                    onClick={() => setSelectedTier(tier.key)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedTier === tier.key
                        ? 'border-[#B8956A] bg-[#B8956A]/5'
                        : 'border-[#B8956A]/15 hover:border-[#B8956A]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-serif text-lg text-[#1A1A1A]">{tier.name}</span>
                      {tier.promo > 0 && (
                        <Badge className="bg-[#B8956A] text-[#1A1A1A]">{tier.promo} promo</Badge>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-[#1A1A1A]">${tier.price}</p>
                    <p className="text-sm text-[#1A1A1A]/60 mt-1">{tier.credits} credits · ${tier.bookingValue} value</p>
                    <p className="text-xs text-[#1A1A1A]/50 mt-1">{tier.validity}</p>
                  </div>
                ))}
              </div>

              {selectedTier && (
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => handlePurchase(selectedTier)}
                    disabled={loading || !customerEmail}
                    className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                    Purchase {TIERS.find(t => t.key === selectedTier)?.name}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Wallet Detail View */}
        {view === "wallet" && selectedWallet && (
          <Card className="mb-8 border-[#B8956A]/20 bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#1A1A1A]">Wallet — {selectedWallet.wallet.customer_name}</CardTitle>
                <Button variant="ghost" onClick={() => { setView("tiers"); setSelectedWallet(null); }} className="text-[#1A1A1A]/60">
                  Back
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="p-3 rounded-lg bg-[#B8956A]/5">
                  <p className="text-xs text-[#1A1A1A]/50">Tier</p>
                  <p className="text-lg font-medium text-[#1A1A1A]">{selectedWallet.wallet.tier}</p>
                </div>
                <div className="p-3 rounded-lg bg-[#B8956A]/5">
                  <p className="text-xs text-[#1A1A1A]/50">Booking Value</p>
                  <p className="text-lg font-medium text-[#1A1A1A]">${selectedWallet.wallet.booking_value_balance}</p>
                </div>
                <div className="p-3 rounded-lg bg-[#B8956A]/5">
                  <p className="text-xs text-[#1A1A1A]/50">Credits</p>
                  <p className="text-lg font-medium text-[#1A1A1A]">{selectedWallet.wallet.credits_balance}</p>
                </div>
                <div className="p-3 rounded-lg bg-[#B8956A]/5">
                  <p className="text-xs text-[#1A1A1A]/50">Promo Benefits</p>
                  <p className="text-lg font-medium text-[#1A1A1A]">{selectedWallet.wallet.promotional_benefits_available - selectedWallet.wallet.promotional_benefits_used}</p>
                </div>
              </div>

              {/* Credit Lots */}
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-2">Credit Lots (FIFO)</h3>
              <div className="space-y-2 mb-6">
                {selectedWallet.lots?.map(lot => (
                  <div key={lot.id} className="flex items-center justify-between p-3 rounded-lg border border-[#B8956A]/15">
                    <div className="flex items-center gap-3">
                      <Badge className={lot.expired ? "bg-gray-400 text-white" : "bg-[#B8956A] text-[#1A1A1A]"}>
                        {lot.expired ? "Expired" : "Active"}
                      </Badge>
                      <span className="text-sm text-[#1A1A1A]">{lot.credits_remaining} credits · ${lot.booking_value_remaining}</span>
                    </div>
                    <span className="text-xs text-[#1A1A1A]/50">
                      Expires {new Date(lot.expires_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
                {(!selectedWallet.lots || selectedWallet.lots.length === 0) && (
                  <p className="text-sm text-[#1A1A1A]/40">No credit lots</p>
                )}
              </div>

              {/* Recent Transactions */}
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-2">Recent Activity</h3>
              <div className="space-y-2">
                {selectedWallet.recent_transactions?.map(txn => (
                  <div key={txn.id} className="flex items-center justify-between p-3 rounded-lg border border-[#B8956A]/10">
                    <div>
                      <p className="text-sm font-medium text-[#1A1A1A]">{txn.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-[#1A1A1A]/50">{txn.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-[#1A1A1A]">
                        {txn.credits > 0 ? '+' : ''}{txn.credits} credits
                      </p>
                      <p className="text-xs text-[#1A1A1A]/50">{new Date(txn.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reload buttons */}
              <div className="flex gap-2 pt-4 border-t border-[#B8956A]/15 mt-4">
                {TIERS.map(tier => (
                  <Button
                    key={tier.key}
                    variant="outline"
                    size="sm"
                    onClick={() => handleReload(selectedWallet.wallet.id, tier.key)}
                    disabled={loading}
                    className="border-[#B8956A]/30 text-[#1A1A1A] hover:bg-[#B8956A]/10"
                  >
                    <RotateCw className="w-3 h-3 mr-1" />
                    {tier.name} ${tier.price}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stress Test Results */}
        {view === "stress" && result && (
          <Card className="mb-8 border-[#B8956A]/20 bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#1A1A1A]">Financial Stress Test Results</CardTitle>
                <Button variant="ghost" onClick={() => { setView("tiers"); setResult(null); }} className="text-[#1A1A1A]/60">
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className={`p-4 rounded-lg mb-4 ${result.status === 'PASS' ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                <p className="font-medium text-[#1A1A1A]">
                  Status: {result.status} — {result.total_combinations_tested} combinations tested
                </p>
                {result.problems_count > 0 && (
                  <p className="text-sm text-amber-800 mt-1">{result.problems_count} problems found</p>
                )}
              </div>

              {result.worst_margin && (
                <div className="p-4 rounded-lg bg-[#B8956A]/5 mb-4">
                  <p className="text-sm font-medium text-[#1A1A1A] mb-2">Worst Valid Margin</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-[#1A1A1A]/50">Tier:</span> {result.worst_margin.tier}</div>
                    <div><span className="text-[#1A1A1A]/50">SqFt:</span> {result.worst_margin.sqft_tier}</div>
                    <div><span className="text-[#1A1A1A]/50">Package:</span> {result.worst_margin.package}</div>
                    <div><span className="text-[#1A1A1A]/50">Margin:</span> {result.worst_margin.margin_pct_after_one_redemption}%</div>
                  </div>
                </div>
              )}

              {result.problems?.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-red-800 mb-2">Problems</p>
                  <div className="space-y-1">
                    {result.problems.map((p, i) => (
                      <p key={i} className="text-xs text-red-700 font-mono">{p}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <p className="text-sm font-medium text-[#1A1A1A] mb-2">Add-On Credit Conversions ($275/credit)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {result.addon_credit_conversions?.map(a => (
                    <div key={a.name} className="p-2 rounded border border-[#B8956A]/15 text-sm">
                      <span className="font-medium text-[#1A1A1A]">{a.name}</span>: ${a.price} = {a.credits} credits
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-[#1A1A1A] mb-2">Commission Stacking Prevention</p>
                <div className="space-y-1">
                  {result.commission_stacking_tests?.map(t => (
                    <div key={t.tier} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-[#B8956A]" />
                      <span className="text-[#1A1A1A]">{t.tier}: ${t.purchase_commission} purchase → $0 redemption (stacking prevented: {String(t.stacking_prevented)})</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Existing Wallets */}
        {view === "tiers" && wallets.length > 0 && (
          <div>
            <h2 className="text-xl font-serif text-[#1A1A1A] mb-4">Active Prepaid Wallets</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {wallets.map(w => (
                <Card key={w.id} className="border-[#B8956A]/20 bg-white cursor-pointer hover:border-[#B8956A]/40 transition-all" onClick={() => loadWalletDetail(w.id)}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-[#1A1A1A]">{w.customer_name || w.customer_email}</span>
                      <Badge className="bg-[#B8956A] text-[#1A1A1A]">{w.tier}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-[#1A1A1A]/50">Booking Value:</span> <span className="font-medium text-[#1A1A1A]">${w.booking_value_balance}</span></div>
                      <div><span className="text-[#1A1A1A]/50">Credits:</span> <span className="font-medium text-[#1A1A1A]">{w.credits_balance}</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Tier Cards (default view) */}
        {view === "tiers" && (
          <div className="mt-8">
            <h2 className="text-xl font-serif text-[#1A1A1A] mb-4">Prepaid Tiers</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {TIERS.map(tier => (
                <Card key={tier.key} className="border-[#B8956A]/20 bg-white">
                  <CardContent className="pt-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-serif text-xl text-[#1A1A1A]">{tier.name}</span>
                      {tier.promo > 0 && (
                        <Badge className="bg-[#B8956A] text-[#1A1A1A]">{tier.promo} promo</Badge>
                      )}
                    </div>
                    <p className="text-3xl font-bold text-[#1A1A1A] mb-1">${tier.price}</p>
                    <p className="text-sm text-[#1A1A1A]/60 mb-3">{tier.credits} credits · ${tier.bookingValue} booking value</p>
                    <p className="text-xs text-[#1A1A1A]/50 mb-3">Valid {tier.validity}</p>
                    <ul className="space-y-1.5">
                      {tier.benefits.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-[#1A1A1A]/70">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#B8956A] mt-0.5 shrink-0" />
                          {b}
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