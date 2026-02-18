import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from "../utils";

let stripePromise = null;

const getStripePromise = () => {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  console.log('Stripe key exists:', !!key);
  if (!stripePromise && key) {
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

function CheckoutForm({ totalAmount }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!stripe) {
      console.log('Stripe not loaded yet');
    }
    if (!elements) {
      console.log('Elements not ready yet');
    }
  }, [stripe, elements]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      setErrorMessage("Payment form not ready. Please refresh the page.");
      return;
    }

    if (processing) {
      return;
    }

    setProcessing(true);
    setErrorMessage("");

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/MediaPartnerDashboard`,
        },
      });

      if (result.error) {
        setErrorMessage(result.error.message || "Payment failed");
      }
      setProcessing(false);
    } catch (err) {
      console.error('Stripe error:', err);
      setErrorMessage("Payment failed. Please try again.");
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement options={{ layout: "tabs" }} />
      
      <div className="pt-4 border-t border-[var(--border-color)]">
        <div className="flex justify-between text-lg font-semibold text-[var(--text-primary)] mb-4">
          <span>Total:</span>
          <span>${totalAmount.toFixed(2)}</span>
        </div>
        
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
            {errorMessage}
          </div>
        )}
        
        <button
          type="submit"
          disabled={processing}
          className="w-full px-4 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          {processing ? "Processing..." : `Pay $${totalAmount.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
}

export default function OrientationOnboardingFee() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [totalAmount, setTotalAmount] = useState(50);
  const [addGearBag, setAddGearBag] = useState(false);
  const [addWaterBottle, setAddWaterBottle] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const initPayment = async () => {
      try {
        const email = localStorage.getItem('user_email');
        if (!email) {
          navigate(createPageUrl("SignIn"));
          return;
        }

        const response = await base44.functions.invoke('createOnboardingPaymentIntent', { email });
        
        if (response.data.alreadyPaid) {
          localStorage.setItem('onboardingFeePaid', 'true');
          navigate(createPageUrl("MediaPartnerDashboard"));
          return;
        }

        if (!response.data.clientSecret) {
          setError("Failed to initialize payment. Please try again.");
          setLoading(false);
          return;
        }

        setUserData({
          email,
          full_name: localStorage.getItem('user_name'),
          user_type: localStorage.getItem('user_type'),
        });
        setTotalAmount(response.data.totalAmount || 50);
        setAddGearBag(response.data.addGearBag || false);
        setAddWaterBottle(response.data.addWaterBottle || false);
        setClientSecret(response.data.clientSecret);
        setLoading(false);
      } catch (err) {
        console.error("Payment initialization error:", err);
        setError("Failed to initialize payment. Please try again.");
        setLoading(false);
      }
    };

    initPayment();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent-color)]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
            <CardContent className="pt-6">
              <p className="text-red-600">{error}</p>
              <Button className="mt-4 w-full" onClick={() => window.location.reload()}>Retry</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <p className="text-[var(--text-primary)]">Loading payment form...</p>
        </div>
      </div>
    );
  }

  const stripePromiseInstance = getStripePromise();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
          <CardHeader>
            <CardTitle className="text-3xl text-[var(--text-primary)]">Onboarding Fee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-[var(--text-secondary)]">
              A onboarding fee is required to cover your required shirt and jacket for jobs.
            </p>

            <div className="bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] space-y-2">
              <div className="flex justify-between text-[var(--text-primary)]">
                <span>Required Apparel (Shirt & Jacket)</span>
                <span>$1.00</span>
              </div>
              {addGearBag && (
                <div className="flex justify-between text-[var(--text-primary)]">
                  <span>Gear Bag</span>
                  <span>$1.00</span>
                </div>
              )}
              {addWaterBottle && (
                <div className="flex justify-between text-[var(--text-primary)]">
                  <span>Water Bottle</span>
                  <span>$1.00</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-[var(--text-primary)] border-t border-[var(--border-color)] pt-2">
                <span>Total</span>
                <span>${totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {stripePromiseInstance ? (
              <Elements stripe={stripePromiseInstance} options={{ clientSecret }}>
                <CheckoutForm totalAmount={totalAmount} />
              </Elements>
            ) : (
              <div className="p-4 bg-red-50 border border-red-200 rounded text-red-600">
                Failed to load payment processor. Please refresh the page.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}