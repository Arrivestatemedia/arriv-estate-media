import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, CreditCard } from "lucide-react";

export default function StepStripe({ onboarding, identity, onUpdated }) {
  const connected = !!onboarding.stripe_connected_at;
  const [launching, setLaunching] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  // If returning from Stripe (?stripe_done=1), verify status automatically
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe_done") === "1" && !connected) {
      (async () => {
        setChecking(true);
        try {
          const res = await base44.functions.invoke("checkSalesStripeStatus", identity);
          if (res.data?.success) onUpdated(res.data.onboarding);
        } catch (e) {
          setError(e.message || "Could not verify Stripe status.");
        } finally {
          setChecking(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const launch = async () => {
    setLaunching(true);
    setError("");
    try {
      const res = await base44.functions.invoke("createSalesStripeOnboarding", identity);
      if (res.data?.url) window.location.href = res.data.url;
      else setError(res.data?.error || "Could not start Stripe onboarding.");
    } catch (e) {
      setError(e.message || "Could not start Stripe onboarding.");
    } finally {
      setLaunching(false);
    }
  };

  const recheck = async () => {
    setChecking(true);
    setError("");
    try {
      const res = await base44.functions.invoke("checkSalesStripeStatus", identity);
      if (res.data?.success) onUpdated(res.data.onboarding);
      else setError(res.data?.error || "Could not verify.");
    } catch (e) {
      setError(e.message || "Could not verify.");
    } finally {
      setChecking(false);
    }
  };

  if (connected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">Stripe account connected</span>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">You're set to receive commission payouts. You can update your payout details anytime via Stripe.</p>
        <Button variant="outline" onClick={launch} className="border-[#B8956A] text-[#B8956A]">
          <CreditCard className="w-4 h-4 mr-2" /> Update Stripe Details
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">Connect a Stripe account to receive your commission payouts by direct deposit.</p>
      <Button onClick={launch} disabled={launching} className="bg-[#635bff] hover:bg-[#5851eb] text-white">
        {launching ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...</> : <><CreditCard className="w-4 h-4 mr-2" /> Connect with Stripe</>}
      </Button>
      <p className="text-xs text-[var(--text-secondary)]">Already connected via Stripe? Click below to verify your connection status.</p>
      <Button variant="outline" onClick={recheck} disabled={checking} className="border-[#B8956A]/40 text-[var(--text-primary)]">
        {checking ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking...</> : "I've completed Stripe setup — verify"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}