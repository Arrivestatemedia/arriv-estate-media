import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Wallet, Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PayoutSettings({ user, onSave }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleStripeOnboard = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke('stripeConnectOnboard', {});
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setError("Could not start Stripe onboarding");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to start Stripe onboarding");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-[#B8956A]/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <Wallet className="w-5 h-5 text-[#B8956A]" />
          </div>
          <div>
            <CardTitle className="text-[#1A1A1A]">Payout Setup</CardTitle>
            <CardDescription>
              Direct deposit via Stripe — automatic every Friday
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-blue-50 border-blue-200">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm text-blue-900">
            All payouts are processed through <strong>Stripe Connect</strong>. You'll complete a
            quick one-time setup with Stripe to verify your identity and link your bank account.
            Your balance is then deposited automatically every Friday — and you can request an
            instant payout anytime for a 1.5% fee.
          </AlertDescription>
        </Alert>

        <div className="space-y-3 p-4 rounded-lg bg-[#B8956A]/5 border border-[#B8956A]/20">
          <div className="flex items-center gap-2 text-sm text-[#1A1A1A]/80">
            <Zap className="w-4 h-4 text-[#B8956A]" />
            <span>Automatic Friday deposits to your bank account</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#1A1A1A]/80">
            <Zap className="w-4 h-4 text-[#B8956A]" />
            <span>Optional instant payouts (1.5% fee) to your debit card</span>
          </div>
        </div>

        <Button
          onClick={handleStripeOnboard}
          disabled={loading}
          className="w-full bg-[#B8956A] hover:bg-[#A68559]"
        >
          {loading ? "Starting setup..." : "Set up direct deposit with Stripe"}
        </Button>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-900">
              Payout settings updated successfully!
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}