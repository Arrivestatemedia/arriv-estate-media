import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle, CheckCircle2, Wallet, Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PayoutSettings({ user, onSave }) {
  const [payoutMethod, setPayoutMethod] = useState(user?.payout_method || "");
  const [zelleInfo, setZelleInfo] = useState(user?.zelle_info || "");
  const [bankAccountNumber, setBankAccountNumber] = useState(user?.bank_account_number || "");
  const [routingNumber, setRoutingNumber] = useState(user?.bank_routing_number || "");
  const [loading, setLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleStripeOnboard = async () => {
    setStripeLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke('stripeConnectOnboard', {});
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setError("Could not start Stripe onboarding");
      }
    } catch (err) {
      setError(err.message || "Failed to start Stripe onboarding");
    } finally {
      setStripeLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      if (payoutMethod === "zelle") {
        if (!zelleInfo) {
          setError("Please enter Zelle phone number or email");
          setLoading(false);
          return;
        }
      } else if (payoutMethod === "bank_account") {
        if (!bankAccountNumber || !routingNumber) {
          setError("Please enter both account and routing numbers");
          setLoading(false);
          return;
        }
      }

      await base44.functions.invoke('savePayoutSettings', {
        email: user?.email,
        payout_method: payoutMethod,
        zelle_info: zelleInfo,
        bank_account_number: bankAccountNumber,
        bank_routing_number: routingNumber
      });

      setSuccess(true);
      if (onSave) onSave();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message || "Failed to update payout settings");
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
            <CardTitle className="text-[#1A1A1A]">Payout Settings</CardTitle>
            <CardDescription>
              Your balance is automatically paid out every Friday at 4am
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-blue-50 border-blue-200">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm text-blue-900">
            <strong>Direct Deposit (Stripe)</strong> is automatic and pays out every Friday. 
            <strong> Bank account</strong> payouts take 3-5 business days. 
            <strong> Zelle</strong> payouts are instant but processed manually.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Payout Method</Label>
            <RadioGroup value={payoutMethod} onValueChange={setPayoutMethod}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="stripe_connect" id="stripe_connect" />
                <Label htmlFor="stripe_connect" className="font-normal cursor-pointer flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-[#B8956A]" /> Direct Deposit via Stripe (Automatic)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="zelle" id="zelle" />
                <Label htmlFor="zelle" className="font-normal cursor-pointer">Zelle (Instant, manual)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bank_account" id="bank_account" />
                <Label htmlFor="bank_account" className="font-normal cursor-pointer">Bank Account (Manual, 3-5 days)</Label>
              </div>
            </RadioGroup>
          </div>

          {payoutMethod === "stripe_connect" && (
            <div className="space-y-3 p-4 rounded-lg bg-[#B8956A]/5 border border-[#B8956A]/20">
              <p className="text-sm text-[#1A1A1A]/80">
                We'll pay your balance straight to your bank account automatically every Friday via Stripe.
                You'll complete a quick one-time setup with Stripe to verify your identity and link your bank.
              </p>
              <Button
                onClick={handleStripeOnboard}
                disabled={stripeLoading}
                className="w-full bg-[#B8956A] hover:bg-[#A68559]"
              >
                {stripeLoading ? "Starting setup..." : "Set up direct deposit with Stripe"}
              </Button>
            </div>
          )}

          {payoutMethod === "zelle" && (
            <div>
              <Label>Zelle Phone Number or Email</Label>
              <Input
                value={zelleInfo}
                onChange={(e) => setZelleInfo(e.target.value)}
                placeholder="phone@example.com or +1234567890"
                className="border-[#B8956A]/30"
              />
            </div>
          )}

          {payoutMethod === "bank_account" && (
            <>
              <div>
                <Label>Bank Account Number</Label>
                <Input
                  type="text"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="Account number"
                  className="border-[#B8956A]/30"
                />
                {user?.bank_account_last4 && (
                  <p className="text-xs text-[#1A1A1A]/60 mt-1">
                    Current account ending in ****{user.bank_account_last4}
                  </p>
                )}
              </div>
              <div>
                <Label>Routing Number</Label>
                <Input
                  type="text"
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value)}
                  placeholder="9-digit routing number"
                  className="border-[#B8956A]/30"
                />
              </div>
            </>
          )}

          {payoutMethod !== "stripe_connect" && (
            <Button
              onClick={handleSave}
              disabled={loading || !payoutMethod}
              className="w-full bg-[#B8956A] hover:bg-[#A68559]"
            >
              {loading ? "Saving..." : "Save Payout Settings"}
            </Button>
          )}

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
        </div>
      </CardContent>
    </Card>
  );
}