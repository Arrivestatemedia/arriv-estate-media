import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from "../utils";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

function CheckoutForm({ totalAmount, user }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setErrorMessage("");

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${createPageUrl("MediaPartnerDashboard")}`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setProcessing(false);
      }
    } catch (err) {
      setErrorMessage("Payment failed. Please try again.");
      setProcessing(false);
    }
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState("");
  const [totalAmount, setTotalAmount] = useState(50);

  useEffect(() => {
    const initPayment = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);

        // If already paid, show completion message
        if (userData.onboardingFeePaid) {
          setLoading(false);
          return;
        }

        // If sizes not confirmed, redirect back
        if (!userData.shirtSize || !userData.jacketSize) {
          navigate(createPageUrl("OrientationSizes"));
          return;
        }

        // Calculate total
        const total = 50 + (userData.addGearBag ? 50 : 0) + (userData.addWaterBottle ? 40 : 0);
        setTotalAmount(total);

        // Create payment intent
        const response = await base44.functions.invoke("createMediaPartnerOnboardingPaymentIntent", {
          userId: userData.id
        });

        setClientSecret(response.data.clientSecret);
      } catch (error) {
        console.error("Error initializing payment:", error);
        alert("Failed to initialize payment. Please try again.");
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

  if (user?.onboardingFeePaid) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
            <CardHeader>
              <CardTitle className="text-3xl text-[var(--text-primary)]">Payment Complete</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-[var(--text-secondary)]">
                Your onboarding fee has been paid. You're all set!
              </p>
              <Button
                onClick={() => navigate(createPageUrl("MediaPartnerDashboard"))}
                className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white"
                size="lg"
              >
                Continue to Dashboard
              </Button>
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
              A $50 onboarding fee is required. This covers your required shirt and jacket for jobs.
            </p>

            {/* Breakdown */}
            <div className="bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] space-y-2">
              <div className="flex justify-between text-[var(--text-primary)]">
                <span>Required Apparel (Shirt & Jacket)</span>
                <span>$50.00</span>
              </div>
              {user?.addGearBag && (
                <div className="flex justify-between text-[var(--text-primary)]">
                  <span>Gear Bag</span>
                  <span>$50.00</span>
                </div>
              )}
              {user?.addWaterBottle && (
                <div className="flex justify-between text-[var(--text-primary)]">
                  <span>Water Bottle</span>
                  <span>$40.00</span>
                </div>
              )}
            </div>

            {clientSecret && (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <CheckoutForm totalAmount={totalAmount} user={user} />
              </Elements>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}