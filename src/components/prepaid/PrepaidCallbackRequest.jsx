import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { withCustomerSession } from "@/lib/customerSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PhoneCall, CheckCircle2, Loader2 } from "lucide-react";

/**
 * Asking a specialist to call about a prepaid package. The request is recorded server-side and the
 * Arriv team is notified — the customer never has to email anyone.
 */
export default function PrepaidCallbackRequest({ tier, email }) {
  const [state, setState] = useState({ status: "idle", error: "" });

  const request = async () => {
    setState({ status: "sending", error: "" });
    try {
      const res = await base44.functions.invoke(
        "requestPrepaidCallback",
        withCustomerSession({
          tier: {
            key: tier.key,
            name: tier.name,
            price: tier.price,
            credits: tier.credits,
            booking_value: tier.bookingValue,
            validity: tier.validity,
          },
        }),
      );
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setState({ status: "sent", error: "" });
    } catch (err) {
      setState({ status: "idle", error: "That request could not be sent just now. Please try again." });
    }
  };

  return (
    <Card className="mb-8 border-[#B8956A]/30 bg-white">
      <CardContent className="pt-6 space-y-3">
        <p className="text-sm text-[#1A1A1A]">
          <span className="font-medium">{tier.name}</span> — ${tier.price} for {tier.credits} credits and $
          {tier.bookingValue} of booking value, valid {tier.validity}.
        </p>

        {state.status === "sent" ? (
          <div className="flex items-start gap-2 rounded-xl border border-[#B8956A]/40 bg-[#FFFBF5] p-3">
            <CheckCircle2 className="w-4 h-4 text-[#B8956A] mt-0.5 shrink-0" />
            <p className="text-sm text-[#1A1A1A]">
              Request received. A specialist has been notified and will call you
              {email ? ` on the number on your account (${email})` : ""} to set it up. Nothing has been charged.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-[#1A1A1A]/60">
              We'll have a specialist call you to set this up. Nothing is charged from this screen.
            </p>
            <Button
              onClick={request}
              disabled={state.status === "sending"}
              className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
            >
              {state.status === "sending" ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <PhoneCall className="w-4 h-4 mr-2" />
              )}
              Request a call about {tier.name}
            </Button>
          </>
        )}

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </CardContent>
    </Card>
  );
}