import React, { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";

// The card form for a package purchase.
//
// The server creates the payment intent and hands back only its client secret; nothing about the
// amount or the entitlement is decided here. Activation happens afterwards, on the server, and only
// once Stripe confirms the payment.

const stripeCache = { key: "", promise: null };

function stripeFor(key) {
  if (!key) return null;
  if (stripeCache.key !== key) {
    stripeCache.key = key;
    stripeCache.promise = loadStripe(key);
  }
  return stripeCache.promise;
}

function CheckoutForm({ priceLabel, onPaid }) {
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
      if (result.error) {
        setError(result.error.message || "The card could not be charged.");
      } else if (result.paymentIntent?.status === "succeeded") {
        onPaid(result.paymentIntent.id);
      } else {
        setError("The payment has not completed. If money left your account, it will be confirmed automatically.");
      }
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
        Pay {priceLabel}
      </Button>
      <p className="text-[11px] leading-relaxed text-[#1A1A1A]/45">
        One-time payment. Nothing renews automatically. Your free property page stays published whatever happens with this package.
      </p>
    </form>
  );
}

export default function PackageCheckoutDialog({ open, onOpenChange, checkout, onPaid }) {
  const publishableKey = useMemo(() => String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ""), []);
  const stripePromise = useMemo(() => stripeFor(publishableKey), [publishableKey]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (open && checkout?.clientSecret) setReady(true);
    if (!open) setReady(false);
  }, [open, checkout]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-[#1A1A1A]">{checkout?.tierName || "Complete your purchase"}</DialogTitle>
          <DialogDescription className="text-sm text-[#1A1A1A]/55">
            {checkout?.priceLabel} one-time for 30 eligible promotional days.
          </DialogDescription>
        </DialogHeader>

        {!publishableKey && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Card payments are not configured in this environment. Nothing can be charged.
          </p>
        )}

        {ready && stripePromise && checkout?.clientSecret ? (
          <Elements stripe={stripePromise} options={{ clientSecret: checkout.clientSecret }}>
            <CheckoutForm priceLabel={checkout.priceLabel} onPaid={onPaid} />
          </Elements>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}