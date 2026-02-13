import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Wallet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PayoutSettings({ user }) {
  const [payoutMethod, setPayoutMethod] = useState(user?.payout_method || "");
  const [zelleInfo, setZelleInfo] = useState(user?.zelle_info || "");
  const [bankAccountNumber, setBankAccountNumber] = useState(user?.bank_account_number || "");
  const [routingNumber, setRoutingNumber] = useState(user?.bank_routing_number || "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const updateData = { payout_method: payoutMethod };

      if (payoutMethod === "zelle") {
        if (!zelleInfo) {
          setError("Please enter Zelle phone number or email");
          setLoading(false);
          return;
        }
        updateData.zelle_info = zelleInfo;
      } else if (payoutMethod === "bank_account") {
        if (!bankAccountNumber || !routingNumber) {
          setError("Please enter both account and routing numbers");
          setLoading(false);
          return;
        }
        updateData.bank_account_number = bankAccountNumber;
        updateData.bank_account_last4 = bankAccountNumber.slice(-4);
        updateData.bank_routing_number = routingNumber;
      }

      await base44.auth.updateMe(updateData);
      setSuccess(true);
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
            <strong>Bank account payouts</strong> take 3-5 business days to deposit. 
            <strong> Zelle payouts</strong> are typically instant.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div>
            <Label>Payout Method</Label>
            <Select value={payoutMethod} onValueChange={setPayoutMethod}>
              <SelectTrigger className="border-[#B8956A]/30">
                <SelectValue placeholder="Select payout method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zelle">Zelle (Instant)</SelectItem>
                <SelectItem value="bank_account">Bank Account (3-5 days)</SelectItem>
              </SelectContent>
            </Select>
          </div>

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

          <Button
            onClick={handleSave}
            disabled={loading || !payoutMethod}
            className="w-full bg-[#B8956A] hover:bg-[#A68559]"
          >
            {loading ? "Saving..." : "Save Payout Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}