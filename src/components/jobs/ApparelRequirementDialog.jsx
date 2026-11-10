import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { withCustomerSession } from "@/lib/customerSession";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shirt, CheckCircle2 } from "lucide-react";

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

export default function ApparelRequirementDialog({ open, onOpenChange, email, completedJobs = 2 }) {
  const navigate = useNavigate();
  const [shirtFit, setShirtFit] = useState("");
  const [shirtSize, setShirtSize] = useState("");
  const [jacketSize, setJacketSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [purchased, setPurchased] = useState(false);

  const { data: jobs = [] } = useQuery({
    queryKey: ["apparel-gate-jobs", email],
    queryFn: async () => {
      const res = await base44.functions.invoke(
        'getJobRecords',
        withCustomerSession({ view: 'contractor_mine', limit: 200 })
      );
      return res?.data?.items || res?.items || [];
    },
    enabled: open && !!email,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["apparel-gate-payouts", email],
    queryFn: () => base44.entities.PayoutHistory.filter({ media_partner_email: email }),
    enabled: open && !!email,
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

  const handlePayFromBalance = async () => {
    if (!shirtFit || !shirtSize || !jacketSize) {
      setError("Please select your shirt fit, shirt size, and jacket size.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await base44.functions.invoke("saveOrientationData", {
        email,
        shirtFit,
        shirtSize,
        jacketSize,
        addGearBag: false,
        addWaterBottle: false,
      });
      const res = await base44.functions.invoke("purchaseApparel", { email, method: "balance" });
      if (res.data?.success) {
        setPurchased(true);
      } else {
        setError(res.data?.error || "Could not complete purchase.");
      }
    } catch (e) {
      setError(e?.data?.error || e?.message || "Could not complete purchase.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {purchased ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-[#B8956A] mx-auto mb-4" />
            <DialogTitle className="text-xl mb-2">You're all set</DialogTitle>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Your shirt &amp; jacket is ordered and $50 was deducted from your balance. A receipt is on its way to your email.
            </p>
            <Button
              onClick={() => onOpenChange(false)}
              className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="w-12 h-12 rounded-full bg-[#B8956A]/15 flex items-center justify-center mb-2">
                <Shirt className="w-6 h-6 text-[#B8956A]" />
              </div>
              <DialogTitle className="text-xl">That's {completedJobs} jobs done — congrats!</DialogTitle>
              <DialogDescription className="text-base pt-2">
                Your first two shoots were on us. From your next booking, the Arriv shirt &amp; jacket ($50, one time) is required. Order it now or from your dashboard — you just can't book a new job until it's ordered.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)] text-xs">Shirt Fit</Label>
                  <select
                    value={shirtFit}
                    onChange={(e) => { setShirtFit(e.target.value); setShirtSize(""); }}
                    className="w-full h-10 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="" disabled>Fit</option>
                    <option value="MEN">Men</option>
                    <option value="WOMEN">Women</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)] text-xs">Shirt Size</Label>
                  <select
                    value={shirtSize}
                    onChange={(e) => setShirtSize(e.target.value)}
                    disabled={!shirtFit}
                    className="w-full h-10 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="" disabled>Size</option>
                    {shirtSizes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--text-primary)] text-xs">Jacket Size</Label>
                  <select
                    value={jacketSize}
                    onChange={(e) => setJacketSize(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="" disabled>Size</option>
                    {JACKET_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div className="space-y-2 pt-2 border-t border-[var(--border-color)]">
                <Button
                  onClick={handlePayFromBalance}
                  disabled={busy || balance < APPAREL_PRICE}
                  className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
                >
                  {busy ? "Processing..." : `Pay $50 from my balance (${"$"}${balance.toFixed(2)} available)`}
                </Button>
                {balance < APPAREL_PRICE && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Your balance becomes available once your completed job earnings clear. You can still pay out of pocket.
                  </p>
                )}
                <Button
                  onClick={() => { onOpenChange(false); navigate("/PurchaseApparel"); }}
                  disabled={busy}
                  variant="outline"
                  className="w-full border-[#B8956A] text-[#B8956A] hover:bg-[#B8956A]/10"
                >
                  Pay out of pocket instead
                </Button>
                <button
                  onClick={() => onOpenChange(false)}
                  className="w-full text-xs text-[var(--text-secondary)] hover:underline pt-1"
                >
                  I'll do this later
                </button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}