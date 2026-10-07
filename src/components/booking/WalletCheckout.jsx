import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Wallet, Loader2, Info } from "lucide-react";

/**
 * WalletCheckout — checkout wallet payment option for BookingForm.
 * Shows Arriv Wallet balance, lets customer toggle wallet usage.
 * Returns wallet decision via onWalletDecision callback.
 *
 * Props:
 *   customerEmail — the booking customer's email (for wallet lookup)
 *   totalPrice — the booking total (package + add-ons)
 *   onWalletDecision — callback({ useWallet, walletBalance, walletApplied, cashShortfall })
 */
export default function WalletCheckout({ customerEmail, totalPrice, onWalletDecision }) {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [useWallet, setUseWallet] = useState(true); // default on if wallet exists
  const [hasWallet, setHasWallet] = useState(false);

  useEffect(() => {
    if (!customerEmail) { setLoading(false); return; }
    loadWallet();
  }, [customerEmail]);

  useEffect(() => {
    if (!wallet || !totalPrice) return;
    const walletBalance = wallet.booking_value_balance || 0;
    const walletApplied = useWallet ? Math.min(walletBalance, totalPrice) : 0;
    const cashShortfall = totalPrice - walletApplied;
    onWalletDecision?.({ useWallet, walletBalance, walletApplied, cashShortfall, walletId: wallet.id });
  }, [useWallet, wallet, totalPrice, onWalletDecision]);

  const loadWallet = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("managePrepaid", {
        action: "get_wallet",
        customer_email: customerEmail,
      });
      const data = res?.data || res;
      if (data?.wallet && data.wallet.status === 'active' && data.wallet.credits_balance > 0) {
        setWallet(data.wallet);
        setHasWallet(true);
      } else {
        setHasWallet(false);
      }
    } catch {
      setHasWallet(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-[#1A1A1A]/40">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Checking Arriv Wallet...</span>
      </div>
    );
  }

  if (!hasWallet || !wallet) return null;

  const walletBalance = wallet.booking_value_balance || 0;
  const walletApplied = useWallet ? Math.min(walletBalance, totalPrice) : 0;
  const cashShortfall = totalPrice - walletApplied;
  const fullyCovered = walletApplied >= totalPrice;

  return (
    <Card className="border-[#B8956A]/30 bg-[#B8956A]/5">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#B8956A]" />
            <div>
              <p className="text-sm font-medium text-[#1A1A1A]">Use Arriv Wallet</p>
              <p className="text-xs text-[#1A1A1A]/60">${walletBalance.toFixed(2)} Booking Value available</p>
            </div>
          </div>
          <Checkbox
            checked={useWallet}
            onCheckedChange={(checked) => setUseWallet(checked === true)}
          />
        </div>

        {useWallet && (
          <div className="space-y-1.5 pt-2 border-t border-[#B8956A]/15">
            <div className="flex justify-between text-sm">
              <span className="text-[#1A1A1A]/70">Booking Total</span>
              <span className="font-medium text-[#1A1A1A]">${totalPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#1A1A1A]/70">Arriv Wallet</span>
              <span className="font-medium text-[#B8956A]">-${walletApplied.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#1A1A1A]/70">Due Today</span>
              <span className="font-medium text-[#1A1A1A]">${cashShortfall.toFixed(2)}</span>
            </div>
            {fullyCovered ? (
              <Badge className="bg-[#B8956A] text-[#1A1A1A] mt-1">Fully covered by wallet</Badge>
            ) : (
              <div className="flex items-start gap-1.5 mt-1.5">
                <Info className="w-3.5 h-3.5 text-[#B8956A] mt-0.5 shrink-0" />
                <p className="text-xs text-[#1A1A1A]/60">
                  ${cashShortfall.toFixed(2)} will be charged to your payment method. Remaining wallet balance: ${(walletBalance - walletApplied).toFixed(2)}.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}