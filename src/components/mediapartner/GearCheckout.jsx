import React, { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { createPageUrl } from "@/utils";

function PayForm({ totalAmount, successParam }) {
  const successQuery = successParam || "payment_success";
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) {
      setErrorMessage("Payment form not ready. Please refresh the page.");
      return;
    }
    if (processing) return;
    setProcessing(true);
    setErrorMessage("");
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${createPageUrl("MediaPartnerDashboard")}?${successQuery}=true&payment_intent={PAYMENT_INTENT_ID}`,
        },
      });
      if (result.error) {
        setErrorMessage(result.error.message || "Payment failed");
        setProcessing(false);
      }
      // On success Stripe redirects to the return_url; the app gate records the purchase.
    } catch (err) {
      setErrorMessage("Payment failed. Please try again.");
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement options={{ layout: "tabs" }} />
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
          {errorMessage}
        </div>
      )}
      <button
        type="submit"
        disabled={processing || !stripe || !elements}
        className="w-full px-4 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
      >
        {processing ? "Processing..." : `Pay $${totalAmount.toFixed(2)}`}
      </button>
    </form>
  );
}

export default function GearCheckout({ stripePromise, clientSecret, totalAmount, successParam }) {
  if (!clientSecret || !stripePromise) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--accent-color)]" />
        Loading payment form...
      </div>
    );
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PayForm totalAmount={totalAmount} successParam={successParam} />
    </Elements>
  );
}