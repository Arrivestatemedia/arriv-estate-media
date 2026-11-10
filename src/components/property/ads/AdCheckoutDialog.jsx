import React, { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";

// Card form for one advertising campaign. The server created the payment intent and returns only its
// client secret; nothing about the amount or the budget is decided in the browser. The campaign only
// moves forward once the server verifies the payment with Stripe.

const stripeCache = { key: "", promise: null };

function stripeFor(key) {
  if (!key) return null;
  if (stripeCache.key !== key) {
    stripeCache.key = key;
    stripeCache.promise = loadStripe(key);
  }
  return stripeCache.promise;
}

function CheckoutForm({ amountLabel, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    try {
      const result = await stripe.confirmPayment({ elements, redirect: "if_required" });
      if (result.error) setError(result.error.message || "The card could not be charged.");
      else if (result.paymentIntent?.status === "succeeded") onPaid(result.paymentIntent.id);
      else setError("The payment has not completed. If money left your account it will be confirmed automatically.");
    } catch (err) {
      setError(err.message || "The payment could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />
      {error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      <Button type="submit" disabled={!stripe || busy} className="w-full bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
        Pay {amountLabel}
      </Button>
      <p className="text-[11px] leading-relaxed text-[#1A1A1A]/45">
        One-time payment. Nothing renews. Payment alone does not start the campaign: Arriv reviews every campaign before it runs.
      </p>
    </form>
  );
}

export default function AdCheckoutDialog({ open, onOpenChange, checkout, onPaid }) {
  const publishableKey = useMemo(() => String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ""), []);
  const stripePromise = useMemo(() => stripeFor(publishableKey), [publishableKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-[#1A1A1A]">{checkout?.packageName || "Complete your purchase"}</DialogTitle>
          <DialogDescription className="text-sm text-[#1A1A1A]/55">
            {checkout?.amountLabel} one-time for {checkout?.durationDays || 7} days of managed advertising.
          </DialogDescription>
        </DialogHeader>

        {!publishableKey && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Card payments are not configured in this environment. Nothing can be charged.
          </p>
        )}

        {stripePromise && checkout?.clientSecret ? (
          <Elements stripe={stripePromise} options={{ clientSecret: checkout.clientSecret }}>
            <CheckoutForm amountLabel={checkout.amountLabel} onPaid={onPaid} />
          </Elements>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}