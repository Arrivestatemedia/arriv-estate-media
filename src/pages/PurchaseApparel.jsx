import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { createPageUrl } from "../utils";
import { ArrowLeft, Shirt } from "lucide-react";
import GearCheckout from "@/components/mediapartner/GearCheckout";

const MEN_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const WOMEN_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const JACKET_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const APPAREL_PRICE = 50;

const getPayPeriodStart = () => {
  const d = new Date();
  const currentDay = d.getDay();
  const lastFridayDate = d.getDate() - ((currentDay + 2) % 7);
  const lastFriday = new Date(d.getFullYear(), d.getMonth(), lastFridayDate);
  lastFriday.setHours(4, 0, 0, 0);
  return lastFriday;
};

export default function PurchaseApparel() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [shirtFit, setShirtFit] = useState("");
  const [shirtSize, setShirtSize] = useState("");
  const [jacketSize, setJacketSize] = useState("");
  const [stage, setStage] = useState("select");
  const [stripePromise, setStripePromise] = useState(null);
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: jobs = [] } = useQuery({
    queryKey: ["apparel-balance-jobs", user?.email],
    queryFn: () => base44.entities.Job.filter({ booked_by: user?.email }),
    enabled: !!user?.email,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["apparel-balance-payouts", user?.email],
    queryFn: () => base44.entities.PayoutHistory.filter({ media_partner_email: user?.email }),
    enabled: !!user?.email,
  });

  const periodStart = getPayPeriodStart();
  const jobBalance = jobs
    .filter(j => j.status === "completed" && j.completed_at && new Date(j.completed_at) >= periodStart)
    .reduce((s, j) => s + (j.pay_rate || 0), 0);
  const deductions = payouts
    .filter(p => p.payout_type === "apparel_deduction" && new Date(p.payout_date) >= periodStart)
    .reduce((s, p) => s + (p.amount || 0), 0);
  const balance = jobBalance - deductions;

  const shirtSizes = shirtFit === "MEN" ? MEN_SIZES : shirtFit === "WOMEN" ? WOMEN_SIZES : [];

  const saveSizes = async () => {
    await base44.functions.invoke("saveOrientationData", {
      email: user?.email,
      shirtFit,
      shirtSize,
      jacketSize,
      addGearBag: false,
      addWaterBottle: false,
    });
  };

  const validateSizes = () => {
    if (!shirtFit || !shirtSize || !jacketSize) {
      setError("Please select your shirt fit, shirt size, and jacket size.");
      return false;
    }
    setError("");
    return true;
  };

  const handlePayOutOfPocket = async () => {
    if (!validateSizes()) return;
    setBusy(true);
    try {
      await saveSizes();
      const keyRes = await base44.functions.invoke("getStripePublishableKey", {});
      if (!keyRes.data?.publishableKey) {
        setError("Payment processor not configured. Please contact support.");
        setBusy(false);
        return;
      }
      const promise = loadStripe(keyRes.data.publishableKey);
      const res = await base44.functions.invoke("purchaseApparel", { email: user?.email, method: "stripe" });
      if (!res.data?.clientSecret) {
        setError(res.data?.error || "Failed to start checkout.");
        setBusy(false);
        return;
      }
      setStripePromise(promise);
      setClientSecret(res.data.clientSecret);
      setStage("checkout");
    } catch (e) {
      setError("Failed to start checkout. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeductFromBalance = async () => {
    if (!validateSizes()) return;
    setBusy(true);
    try {
      await saveSizes();
      const res = await base44.functions.invoke("purchaseApparel", { email: user?.email, method: "balance" });
      if (res.data?.success) {
        setSuccessMsg("Your shirt & jacket have been purchased and $50 deducted from your balance. A receipt was emailed to you.");
      } else {
        setError(res.data?.error || "Could not complete purchase.");
      }
    } catch (e) {
      setError(e?.data?.error || e?.message || "Could not complete purchase.");
    } finally {
      setBusy(false);
    }
  };

  if (successMsg) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] py-12 px-4">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Shirt className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Purchase Complete</h1>
          <p className="text-[var(--text-secondary)] mb-6">{successMsg}</p>
          <Button className="bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white" onClick={() => navigate(createPageUrl("JobBoard"))}>
            Back to Available Jobs
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" className="mb-4 text-[var(--text-secondary)]" onClick={() => navigate(createPageUrl("JobBoard"))}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Jobs
        </Button>

        <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
          <CardHeader>
            <CardTitle className="text-2xl text-[var(--text-primary)] flex items-center gap-2">
              <Shirt className="w-6 h-6 text-[var(--accent-color)]" />
              Purchase Shirt & Jacket
            </CardTitle>
            <p className="text-[var(--text-secondary)] text-sm">
              You can accept up to 2 jobs without apparel. Purchase your shirt & jacket to unlock unlimited jobs.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {stage === "checkout" ? (
              <>
                <div className="bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex justify-between font-semibold text-[var(--text-primary)]">
                  <span>Shirt & Jacket</span>
                  <span>$50.00</span>
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <GearCheckout
                  stripePromise={stripePromise}
                  clientSecret={clientSecret}
                  totalAmount={50}
                  successParam="apparel_success"
                />
                <Button variant="outline" className="w-full" onClick={() => setStage("select")} disabled={busy}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              </>
            ) : (
              <>
                <div className="bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] flex justify-between font-semibold text-[var(--text-primary)]">
                  <span>Shirt & Jacket</span>
                  <span className="text-[var(--accent-color)]">$50.00</span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[var(--text-primary)]">Shirt Fit</Label>
                    <select
                      value={shirtFit}
                      onChange={(e) => { setShirtFit(e.target.value); setShirtSize(""); }}
                      className="w-full h-11 rounded-md border border-input bg-transparent px-3 py-2"
                    >
                      <option value="" disabled>Select fit</option>
                      <option value="MEN">Men</option>
                      <option value="WOMEN">Women</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[var(--text-primary)]">Shirt Size</Label>
                    <select
                      value={shirtSize}
                      onChange={(e) => setShirtSize(e.target.value)}
                      disabled={!shirtFit}
                      className="w-full h-11 rounded-md border border-input bg-transparent px-3 py-2"
                    >
                      <option value="" disabled>Select size</option>
                      {shirtSizes.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[var(--text-primary)]">Jacket Size</Label>
                    <select
                      value={jacketSize}
                      onChange={(e) => setJacketSize(e.target.value)}
                      className="w-full h-11 rounded-md border border-input bg-transparent px-3 py-2"
                    >
                      <option value="" disabled>Select size</option>
                      {JACKET_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {error && <p className="text-red-600 text-sm">{error}</p>}

                <div className="space-y-3 pt-2 border-t border-[var(--border-color)]">
                  <Button
                    onClick={handlePayOutOfPocket}
                    disabled={busy}
                    className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white"
                    size="lg"
                  >
                    {busy ? "Loading..." : `Pay $50.00 Out of Pocket`}
                  </Button>

                  <div className="text-center text-sm text-[var(--text-secondary)]">or</div>

                  <Button
                    onClick={handleDeductFromBalance}
                    disabled={busy || balance < 50}
                    variant="outline"
                    className="w-full border-[var(--accent-color)] text-[var(--accent-color)] hover:bg-[var(--accent-color)]/10"
                    size="lg"
                  >
                    {busy ? "Processing..." : `Deduct $50.00 from Balance (Available: $${balance.toFixed(2)})`}
                  </Button>
                  {balance < 50 && (
                    <p className="text-xs text-[var(--text-secondary)] text-center">
                      Your current balance isn't enough yet. Complete more jobs or pay out of pocket.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}