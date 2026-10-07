import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, Clock, TrendingUp, TrendingDown, Gift, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";

const TXN_LABELS = {
  PREPAID_PURCHASE: "Prepaid Purchase",
  RELOAD: "Auto-Fund Reload",
  BOOKING_REDEMPTION: "Booking Payment",
  PROMOTIONAL_BENEFIT: "Promotional Add-On",
  REFUND_REVERSAL: "Refund/Reversal",
  EXPIRATION: "Credit Expiration",
  ADMIN_ADJUSTMENT: "Admin Adjustment",
  COMMISSION_EVENT: "Commission Event",
};

export default function WalletPanel({ customerEmail, customerId }) {
  const [wallet, setWallet] = useState(null);
  const [lots, setLots] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState("bv"); // "bv" | "credits"
  const [error, setError] = useState(null);

  const loadWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("managePrepaid", {
        action: "get_wallet",
        customer_email: customerEmail,
        customer_id: customerId,
      });
      const data = res?.data || res;
      if (data?.wallet) {
        setWallet(data.wallet);
        setLots(data.lots || []);
        setTransactions(data.recent_transactions || []);
      } else {
        setWallet(null);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWallet(); }, [customerEmail, customerId]);

  if (loading) {
    return (
      <Card className="border-[#B8956A]/20 bg-white">
        <CardContent className="pt-6 flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-[#B8956A]" />
        </CardContent>
      </Card>
    );
  }

  if (error || !wallet) {
    return (
      <Card className="border-[#B8956A]/20 bg-white">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-[#1A1A1A]/50">
            <Wallet className="w-5 h-5" />
            <p className="text-sm">No Arriv Wallet active for this customer.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeLots = lots.filter(l => !l.expired && l.credits_remaining > 0);
  const bvBalance = wallet.booking_value_balance || 0;
  const creditsBalance = wallet.credits_balance || 0;

  return (
    <Card className="border-[#B8956A]/20 bg-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-[#1A1A1A] flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#B8956A]" />
            Arriv Wallet
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[#B8956A]/20 overflow-hidden">
              <button
                onClick={() => setDisplayMode("bv")}
                className={`px-3 py-1 text-xs font-medium ${displayMode === "bv" ? "bg-[#B8956A] text-[#1A1A1A]" : "bg-white text-[#1A1A1A]/60"}`}
              >
                Booking Value
              </button>
              <button
                onClick={() => setDisplayMode("credits")}
                className={`px-3 py-1 text-xs font-medium ${displayMode === "credits" ? "bg-[#B8956A] text-[#1A1A1A]" : "bg-white text-[#1A1A1A]/60"}`}
              >
                Credits
              </button>
            </div>
            <Button variant="ghost" size="sm" onClick={loadWallet} className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Balance Display */}
        <div className="p-4 rounded-xl bg-[#B8956A]/5 border border-[#B8956A]/15">
          <p className="text-xs text-[#1A1A1A]/50 mb-1">Available</p>
          {displayMode === "bv" ? (
            <>
              <p className="text-3xl font-serif text-[#1A1A1A]">${bvBalance.toFixed(2)}</p>
              <p className="text-xs text-[#1A1A1A]/50 mt-1">{creditsBalance.toFixed(2)} credits available</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-serif text-[#1A1A1A]">{creditsBalance.toFixed(2)}</p>
              <p className="text-xs text-[#1A1A1A]/50 mt-1">${bvBalance.toFixed(2)} Booking Value</p>
            </>
          )}
          {wallet.tier && (
            <Badge className="mt-2 bg-[#B8956A] text-[#1A1A1A]">{wallet.tier}</Badge>
          )}
        </div>

        {/* Credit Lots / Expiration */}
        {activeLots.length > 0 && (
          <div>
            <p className="text-sm font-medium text-[#1A1A1A] mb-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#B8956A]" />
              Expiration Schedule
            </p>
            <div className="space-y-2">
              {activeLots.map(lot => (
                <div key={lot.lot_id} className="flex items-center justify-between p-2.5 rounded-lg border border-[#B8956A]/10 bg-white">
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">
                      ${round2(lot.booking_value_remaining).toFixed(2)} Booking Value
                    </p>
                    <p className="text-xs text-[#1A1A1A]/50">
                      Expires {format(new Date(lot.expires_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-[#B8956A]/30 text-[#B8956A]">
                    {lot.credits_remaining.toFixed(2)} credits
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#1A1A1A]/40 mt-1.5">FIFO redemption: oldest credits consumed first.</p>
          </div>
        )}

        {/* Promotional Benefits */}
        {wallet.promotional_benefits_available > 0 && (
          <div className="p-3 rounded-lg bg-[#B8956A]/5 border border-[#B8956A]/15">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-4 h-4 text-[#B8956A]" />
              <p className="text-sm font-medium text-[#1A1A1A]">Promotional Add-On Benefits</p>
            </div>
            <p className="text-xs text-[#1A1A1A]/60">
              {(wallet.promotional_benefits_available || 0) - (wallet.promotional_benefits_used || 0)} remaining this cycle
            </p>
          </div>
        )}

        {/* Recent Activity */}
        <div>
          <p className="text-sm font-medium text-[#1A1A1A] mb-2">Wallet Activity</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {transactions.length === 0 && (
              <p className="text-xs text-[#1A1A1A]/40 py-2">No wallet activity yet.</p>
            )}
            {transactions.map(txn => {
              const isPositive = (txn.credits || 0) >= 0 && txn.type !== 'BOOKING_REDEMPTION' && txn.type !== 'EXPIRATION';
              const bvValue = Math.abs(txn.booking_value || 0);
              return (
                <div key={txn.transaction_id} className="flex items-start justify-between p-2 rounded-lg hover:bg-[#B8956A]/5">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {isPositive ? (
                      <TrendingUp className="w-3.5 h-3.5 text-[#B8956A] mt-0.5 shrink-0" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-[#1A1A1A]/40 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-[#1A1A1A] truncate">{TXN_LABELS[txn.type] || txn.type}</p>
                      <p className="text-xs text-[#1A1A1A]/50 truncate">{txn.description}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className={`text-sm font-medium ${isPositive ? "text-[#B8956A]" : "text-[#1A1A1A]/70"}`}>
                      {isPositive ? "+" : "-"}${bvValue.toFixed(2)}
                    </p>
                    <p className="text-xs text-[#1A1A1A]/40">{format(new Date(txn.created_at), "MMM d")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function round2(v) { return Math.round(v * 100) / 100; }