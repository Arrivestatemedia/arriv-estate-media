import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Zap, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const FEE_RATE = 0.015; // 1.5%
const MIN_FEE = 0.50;   // $0.50

export default function InstantPayoutDialog({ open, onClose, balance, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const fee = Math.max(balance * FEE_RATE, MIN_FEE);
  const netAmount = Math.max(balance - fee, 0);

  const handleConfirm = async () => {
    setLoading(true);
    setError("");
    setSuccess(null);
    try {
      const res = await base44.functions.invoke('processInstantPayout', {});
      setSuccess(res.data);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Instant payout failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError("");
    setSuccess(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        {!success ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-[#B8956A]" />
                Instant Payout
              </DialogTitle>
              <DialogDescription>
                Get your current balance in minutes instead of waiting for Friday.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2 rounded-lg bg-[#B8956A]/5 border border-[#B8956A]/20 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-[#1A1A1A]/70">Current Balance</span>
                  <span className="font-semibold text-[#1A1A1A]">${balance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#1A1A1A]/70">Instant Payout Fee (1.5%)</span>
                  <span className="font-medium text-red-600">-${fee.toFixed(2)}</span>
                </div>
                <div className="border-t border-[#B8956A]/20 pt-2 flex justify-between">
                  <span className="font-semibold text-[#1A1A1A]">You Receive</span>
                  <span className="font-bold text-green-700">${netAmount.toFixed(2)}</span>
                </div>
              </div>

              <Alert className="bg-amber-50 border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm text-amber-900">
                  <strong>Before you proceed:</strong> Stripe charges a <strong>1.5% fee</strong> (minimum $0.50) for instant payouts.
                  Your free automatic Friday payout has no fee. Instant payouts also require a debit card linked to your Stripe account.
                </AlertDescription>
              </Alert>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={loading || balance <= 0}
                className="bg-[#B8956A] hover:bg-[#A68559]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Confirm Instant Payout
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                Payout Sent!
              </DialogTitle>
              <DialogDescription>
                Your instant payout has been processed and will arrive at your debit card within minutes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 rounded-lg bg-green-50 border border-green-200 p-4 my-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#1A1A1A]/70">Gross Amount</span>
                <span className="font-medium">${success.grossAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#1A1A1A]/70">Fee Charged</span>
                <span className="font-medium text-red-600">-${success.fee.toFixed(2)}</span>
              </div>
              <div className="border-t border-green-200 pt-2 flex justify-between">
                <span className="font-semibold text-[#1A1A1A]">Net Amount</span>
                <span className="font-bold text-green-700">${success.netAmount.toFixed(2)}</span>
              </div>
              <p className="text-xs text-[#1A1A1A]/60 mt-2">
                {success.jobsPaid} job(s) marked as paid.
              </p>
            </div>

            <DialogFooter>
              <Button onClick={handleClose} className="bg-[#B8956A] hover:bg-[#A68559]">
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}