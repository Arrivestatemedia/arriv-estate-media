import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Package, PlusCircle, CreditCard, CheckCircle2 } from "lucide-react";

/**
 * MlsAllowanceCounter — the monthly MLS promotional allowance counter for Auto-Fund members.
 *
 * Shows how many standalone MLS Walkthroughs may use promotional Booking Value this
 * billing cycle, and — once exhausted — the three ways to keep booking:
 * build a bundle, add funds, or pay directly.
 *
 * The allowance is never presented as a limit on total MLS bookings.
 */
export default function MlsAllowanceCounter({ customerEmail, onBuildBundle, onAddFunds, onPayDirectly }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerEmail) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke("manageMlsAllowance", {
          action: "get_status",
          customer_email: customerEmail,
        });
        const data = res?.data || res;
        if (!cancelled && data?.enabled) setStatus(data);
      } catch {
        // Not an Auto-Fund member, or the feature is off — render nothing.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerEmail]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-[#1A1A1A]/40">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Checking MLS promotional benefits...</span>
      </div>
    );
  }

  if (!status) return null;

  const granted = status.allowance_granted ?? 0;
  const used = status.allowance_used ?? 0;
  const remaining = status.allowance_remaining ?? 0;
  const exhausted = remaining <= 0;

  return (
    <Card className="border-[#B8956A]/30 bg-[#B8956A]/5">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-[#B8956A] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#1A1A1A]">MLS Promotional Benefits</p>
              <p className="text-xs text-[#1A1A1A]/60 break-words">
                {granted > 0
                  ? `${used} of ${granted} used — ${remaining} remaining this billing cycle.`
                  : "Promotional Booking Value applies to qualifying bundles. Standalone MLS Walkthroughs use cash-funded value or direct payment."}
              </p>
            </div>
          </div>
          <Badge className={exhausted ? "bg-[#1A1A1A] text-[#FFFBF5]" : "bg-[#B8956A] text-[#1A1A1A]"}>
            {exhausted ? "Allowance used" : `${remaining} left`}
          </Badge>
        </div>

        {granted > 0 && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: granted }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i < used ? "bg-[#1A1A1A]/20" : "bg-[#B8956A]"}`}
              />
            ))}
          </div>
        )}

        {exhausted && (
          <div className="pt-3 border-t border-[#B8956A]/15 space-y-3">
            <p className="text-xs text-[#1A1A1A]/70 leading-relaxed">
              You&apos;ve used your monthly MLS promotional credits. You can still book an MLS Walkthrough!
              Bundle it with qualifying photography or video services, add funds to your wallet, or pay directly.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onBuildBundle}
                className="border-[#B8956A]/40 text-[#1A1A1A] hover:bg-[#B8956A]/10 justify-start sm:justify-center"
              >
                <Package className="w-4 h-4 mr-2 shrink-0" />
                Build a Bundle
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onAddFunds}
                className="border-[#B8956A]/40 text-[#1A1A1A] hover:bg-[#B8956A]/10 justify-start sm:justify-center"
              >
                <PlusCircle className="w-4 h-4 mr-2 shrink-0" />
                Add Funds
              </Button>
              <Button
                size="sm"
                onClick={onPayDirectly}
                className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A] justify-start sm:justify-center"
              >
                <CreditCard className="w-4 h-4 mr-2 shrink-0" />
                Pay Directly
              </Button>
            </div>
          </div>
        )}

        {!exhausted && granted > 0 && (
          <div className="flex items-start gap-1.5 pt-2 border-t border-[#B8956A]/15">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#B8956A] mt-0.5 shrink-0" />
            <p className="text-xs text-[#1A1A1A]/60">
              This is not a limit on how many MLS Walkthroughs you can book. Unlimited further walkthroughs
              are available with cash-funded Booking Value or by direct payment.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}