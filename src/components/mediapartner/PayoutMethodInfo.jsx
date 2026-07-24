import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";

export default function PayoutMethodInfo({ user }) {
  if (!user?.payout_method) return null;

  // All payouts go through Stripe Connect.
  const isStripe = user.payout_method === "stripe_connect";
  const payoutInfo = isStripe
    ? {
        method: "Stripe Connect",
        info: user.stripe_payouts_enabled
          ? "Direct deposit active — payouts every Friday"
          : "Setup incomplete — finish Stripe onboarding"
      }
    : {
        method: "Stripe Connect (required)",
        info: "Zelle/bank payouts are no longer supported. Set up Stripe direct deposit."
      };

  return (
    <Card className="border-[#B8956A]/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <Wallet className="w-5 h-5 text-[#B8956A]" />
          </div>
          <CardTitle className="text-[#1A1A1A]">Current Payout Method</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-[#B8956A] text-white">{payoutInfo.method}</Badge>
          </div>
          <p className="text-sm text-[#1A1A1A]/70">{payoutInfo.info}</p>
        </div>
      </CardContent>
    </Card>
  );
}