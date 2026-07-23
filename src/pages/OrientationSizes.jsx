import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createPageUrl } from "../utils";
import { X, ArrowLeft } from "lucide-react";
import GearCheckout from "@/components/mediapartner/GearCheckout";

const MEN_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const WOMEN_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const JACKET_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

const APPAREL_PRICE = 50;
const GEAR_BAG_PRICE = 50;
const WATER_BOTTLE_PRICE = 40;

export default function OrientationSizes() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [orderApparel, setOrderApparel] = useState(false);
  const [shirtFit, setShirtFit] = useState("");
  const [shirtSize, setShirtSize] = useState("");
  const [jacketSize, setJacketSize] = useState("");
  const [addGearBag, setAddGearBag] = useState(false);
  const [addWaterBottle, setAddWaterBottle] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);

  const [stage, setStage] = useState("select");
  const [stripePromise, setStripePromise] = useState(null);
  const [clientSecret, setClientSecret] = useState("");
  const [checkoutTotal, setCheckoutTotal] = useState(0);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    setLoading(false);
  }, [navigate]);

  const totalSelected =
    (orderApparel ? APPAREL_PRICE : 0) +
    (addGearBag ? GEAR_BAG_PRICE : 0) +
    (addWaterBottle ? WATER_BOTTLE_PRICE : 0);

  const NativeSelect = ({ value, onChange, disabled, placeholder, options }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full h-11 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm appearance-none focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23888\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
    >
      <option value="" disabled>{placeholder}</option>
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );

  const saveSelections = async () => {
    const userEmail = localStorage.getItem('user_email');
    await base44.functions.invoke('saveOrientationData', {
      email: userEmail,
      shirtFit: orderApparel ? shirtFit : "",
      shirtSize: orderApparel ? shirtSize : "",
      jacketSize: orderApparel ? jacketSize : "",
      addGearBag,
      addWaterBottle,
    });
  };

  const handleContinue = async () => {
    if (orderApparel && (!shirtFit || !shirtSize || !jacketSize)) {
      alert("Please select your shirt fit, shirt size, and jacket size.");
      return;
    }
    setSaving(true);
    setCheckoutError("");
    try {
      await saveSelections();

      // Nothing to buy – go straight to the dashboard
      if (totalSelected === 0) {
        navigate(createPageUrl("MediaPartnerDashboard"));
        return;
      }

      // Items selected – start Stripe checkout
      const keyResponse = await base44.functions.invoke('getStripePublishableKey', {});
      if (!keyResponse.data?.publishableKey) {
        setCheckoutError("Payment processor not configured. Please contact support.");
        setSaving(false);
        return;
      }
      const promise = loadStripe(keyResponse.data.publishableKey);

      const email = localStorage.getItem('user_email');
      const piResponse = await base44.functions.invoke('createOnboardingPaymentIntent', { email });
      if (piResponse.data?.alreadyPaid || piResponse.data?.nothingToPay) {
        navigate(createPageUrl("MediaPartnerDashboard"));
        return;
      }
      if (!piResponse.data?.clientSecret) {
        setCheckoutError(piResponse.data?.error || "Failed to start checkout. Please try again.");
        setSaving(false);
        return;
      }
      setStripePromise(promise);
      setClientSecret(piResponse.data.clientSecret);
      setCheckoutTotal(piResponse.data.totalAmount || totalSelected);
      setStage("checkout");
    } catch (error) {
      console.error("Error starting checkout:", error);
      setCheckoutError("Failed to start checkout. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent-color)]"></div>
      </div>
    );
  }

  const shirtSizes = shirtFit === "MEN" ? MEN_SIZES : shirtFit === "WOMEN" ? WOMEN_SIZES : [];

  // ---------- Checkout stage ----------
  if (stage === "checkout") {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
            <CardHeader>
              <CardTitle className="text-3xl text-[var(--text-primary)]">Checkout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] space-y-2">
                {orderApparel && (
                  <div className="flex justify-between text-[var(--text-primary)]">
                    <span>Shirt &amp; Jacket</span>
                    <span>$50.00</span>
                  </div>
                )}
                {addGearBag && (
                  <div className="flex justify-between text-[var(--text-primary)]">
                    <span>Gear Bag</span>
                    <span>$50.00</span>
                  </div>
                )}
                {addWaterBottle && (
                  <div className="flex justify-between text-[var(--text-primary)]">
                    <span>Water Bottle</span>
                    <span>$40.00</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[var(--text-primary)] border-t border-[var(--border-color)] pt-2">
                  <span>Total</span>
                  <span>${checkoutTotal.toFixed(2)}</span>
                </div>
              </div>

              {checkoutError && (
                <p className="text-red-600 text-sm">{checkoutError}</p>
              )}

              <GearCheckout
                stripePromise={stripePromise}
                clientSecret={clientSecret}
                totalAmount={checkoutTotal}
              />

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setStage("select")}
                disabled={saving}
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to selections
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---------- Selection stage ----------
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
      {/* Image zoom modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button className="absolute top-4 right-4 text-white" onClick={() => setZoomedImage(null)}>
            <X className="w-8 h-8" />
          </button>
          <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
          <CardHeader>
            <CardTitle className="text-3xl text-[var(--text-primary)]">Apparel &amp; Gear</CardTitle>
            <p className="text-[var(--text-secondary)] text-sm">
              Everything is optional. Pick what you'd like to purchase, or proceed without any items.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Apparel (optional) */}
            <div className="space-y-4 pb-6 border-b border-[var(--border-color)]">
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">Apparel (Optional)</h3>

              <div className="flex items-start gap-4 p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                <Checkbox
                  id="order-apparel"
                  checked={orderApparel}
                  onCheckedChange={setOrderApparel}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-semibold text-[var(--text-primary)]">Shirt &amp; Jacket</h4>
                    <span className="text-[var(--accent-color)] font-bold">$50.00</span>
                  </div>
                  <Label htmlFor="order-apparel" className="text-[var(--text-secondary)] cursor-pointer">
                    Add required apparel (shirt &amp; jacket)
                  </Label>
                </div>
              </div>

              {orderApparel && (
                <div className="space-y-4 pl-1">
                  <div className="space-y-2">
                    <Label className="text-[var(--text-primary)]">Shirt Fit</Label>
                    <NativeSelect
                      value={shirtFit}
                      onChange={(val) => { setShirtFit(val); setShirtSize(""); }}
                      placeholder="Select fit"
                      options={["MEN", "WOMEN"]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[var(--text-primary)]">Shirt Size</Label>
                    <NativeSelect
                      value={shirtSize}
                      onChange={setShirtSize}
                      disabled={!shirtFit}
                      placeholder="Select size"
                      options={shirtSizes}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[var(--text-primary)]">Jacket Size</Label>
                    <NativeSelect
                      value={jacketSize}
                      onChange={setJacketSize}
                      placeholder="Select size"
                      options={JACKET_SIZES}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Optional Gear */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">Optional Gear</h3>

              {/* Gear Bag */}
              <div className="flex items-start gap-4 p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                <img
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/87121d65d_GearBagImage.png"
                  alt="Gear Bag"
                  className="w-24 h-24 object-cover rounded cursor-pointer active:opacity-80"
                  onClick={() => setZoomedImage("https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/87121d65d_GearBagImage.png")}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-[var(--text-primary)]">Gear Bag</h4>
                    <span className="text-[var(--accent-color)] font-bold">$50.00</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={addGearBag}
                      onCheckedChange={setAddGearBag}
                      id="gear-bag"
                    />
                    <Label htmlFor="gear-bag" className="text-[var(--text-secondary)] cursor-pointer">
                      Add Gear Bag
                    </Label>
                  </div>
                </div>
              </div>

              {/* Water Bottle */}
              <div className="flex items-start gap-4 p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                <img
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/8ca33b43d_WaterBottleImage.png"
                  alt="Water Bottle"
                  className="w-24 h-24 object-cover rounded cursor-pointer active:opacity-80"
                  onClick={() => setZoomedImage("https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/8ca33b43d_WaterBottleImage.png")}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-[var(--text-primary)]">Stainless Steel Water Bottle</h4>
                    <span className="text-[var(--accent-color)] font-bold">$40.00</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={addWaterBottle}
                      onCheckedChange={setAddWaterBottle}
                      id="water-bottle"
                    />
                    <Label htmlFor="water-bottle" className="text-[var(--text-secondary)] cursor-pointer">
                      Add Water Bottle
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Total + actions */}
            <div className="flex justify-between text-lg font-semibold text-[var(--text-primary)] pt-2 border-t border-[var(--border-color)]">
              <span>Total</span>
              <span>${totalSelected.toFixed(2)}</span>
            </div>

            {checkoutError && (
              <p className="text-red-600 text-sm">{checkoutError}</p>
            )}

            <Button
              onClick={handleContinue}
              disabled={saving}
              className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white"
              size="lg"
            >
              {saving
                ? "Loading..."
                : totalSelected > 0
                ? `Continue to Checkout — $${totalSelected.toFixed(2)}`
                : "Proceed Without Items"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}