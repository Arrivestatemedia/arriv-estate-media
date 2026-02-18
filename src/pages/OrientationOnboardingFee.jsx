import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from "../utils";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

function CheckoutForm({ totalAmount, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setErrorMessage("");

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/MediaPartnerDashboard`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setProcessing(false);
    }
    // On success, Stripe redirects to return_url
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <div className="pt-4 border-t border-[var(--border-color)]">
        <div className="flex justify-between text-lg font-semibold text-[var(--text-primary)] mb-4">
          <span>Total:</span>
          <span>${totalAmount}.00</span>
        </div>
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
            {errorMessage}
          </div>
        )}
        <Button
          type="submit"
          disabled={!stripe || processing}
          className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white"
          size="lg"
        >
          {processing ? "Processing..." : `Pay $${totalAmount}.00`}
        </Button>
      </div>
    </form>
  );
}

export default function OrientationOnboardingFee() {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState("");
  const [totalAmount, setTotalAmount] = useState(50);
  const [error, setError] = useState("");

  useEffect(() => {
    const initPayment = async () => {
      try {
        // Get email from localStorage (set during verifySignIn)
        const email = localStorage.getItem('user_email');
        if (!email) {
          navigate(createPageUrl("SignIn"));
          return;
        }

        const storedData = {
          email,
          full_name: localStorage.getItem('user_name'),
          user_type: localStorage.getItem('user_type'),
        };

        // Call backend to create payment intent
        const response = await base44.functions.invoke('createOnboardingPaymentIntent', { email });
        
        if (response.data.alreadyPaid) {
          // Mark paid and navigate to dashboard
          localStorage.setItem('onboardingFeePaid', 'true');
          navigate(createPageUrl("MediaPartnerDashboard"));
          return;
        }

        if (!response.data.clientSecret) {
          setError("Failed to initialize payment. Please try again.");
          setLoading(false);
          return;
        }

        setUserData(storedData);
        setTotalAmount(response.data.totalAmount || 50);
        setClientSecret(response.data.clientSecret);
      } catch (err) {
        console.error("Error initializing payment:", err);
        setError("Failed to initialize payment. Please try again.");
      } finally {
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
                <span>$50.00</span>
              </div>
              {userData?.addGearBag && (
                <div className="flex justify-between text-[var(--text-primary)]">
                  <span>Gear Bag</span>
                  <span>$50.00</span>
                </div>
              )}
              {userData?.addWaterBottle && (
                <div className="flex justify-between text-[var(--text-primary)]">
                  <span>Water Bottle</span>
                  <span>$40.00</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-[var(--text-primary)] border-t border-[var(--border-color)] pt-2">
                <span>Total</span>
                <span>${totalAmount}.00</span>
              </div>
            </div>

            {clientSecret && (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <CheckoutForm totalAmount={totalAmount} />
              </Elements>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}