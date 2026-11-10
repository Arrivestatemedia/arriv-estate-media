import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import PackageTierCard from "./PackageTierCard";
import PromotionStatusCard from "./PromotionStatusCard";
import PropertyPerformancePanel from "./PropertyPerformancePanel";
import MarketingAssetsPanel from "./MarketingAssetsPanel";
import PackageCheckoutDialog from "./PackageCheckoutDialog";

// Package selection, live status, reports and marketing materials for ONE property page.
//
// The panel is additive: it sits below the existing builder and changes nothing about publication,
// approval or the free page. Whether a purchase can be made at all is answered by the server — the
// paid checkout stays closed until it is authorised there.
export default function PropertyPackagePanel({ listing, clientEmail }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [checkout, setCheckout] = useState(null);
  const [marketingKey, setMarketingKey] = useState(0);

  const listingId = listing?.listing_id || "";

  const load = useCallback(async () => {
    if (!listingId || !clientEmail) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("managePropertyPromotion", { action: "overview", listingId, clientEmail });
      const data = res?.data || res;
      if (data?.ok === false) setError(data.message || data.error || "Your packages could not be loaded.");
      else setOverview(data);
    } catch (err) {
      setError(err.message || "Your packages could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [listingId, clientEmail]);

  useEffect(() => {
    load();
  }, [load]);

  const buy = async (tier) => {
    if (tier === "free") return;
    setBusy(tier);
    setNotice("");
    try {
      const res = await base44.functions.invoke("managePropertyPromotion", { action: "start_purchase", listingId, clientEmail, tier });
      const data = res?.data || res;
      if (data?.ok === false) {
        setNotice(data.message || "That purchase could not be started.");
        return;
      }
      setCheckout({
        clientSecret: data.client_secret,
        priceLabel: data.price_label,
        promotionId: data.promotion_id,
        tierName: tier === "pro" ? "Visibility Pro" : "Visibility Plus",
      });
    } catch (err) {
      setNotice(err.message || "That purchase could not be started.");
    } finally {
      setBusy("");
    }
  };

  const onPaid = async (paymentIntentId) => {
    const promotionId = checkout?.promotionId;
    setCheckout(null);
    setBusy("confirm");
    try {
      const res = await base44.functions.invoke("managePropertyPromotion", {
        action: "confirm_purchase",
        listingId,
        clientEmail,
        promotionId,
        paymentIntentId,
      });
      const data = res?.data || res;
      setNotice(
        data?.activated
          ? "Payment confirmed. Your placement is live and your marketing materials are ready below."
          : data?.message || "Payment received. It is being confirmed — this page will show the placement as soon as it clears.",
      );
      await load();
      setMarketingKey((key) => key + 1);
    } catch (err) {
      setNotice(err.message || "The payment could not be confirmed yet. No benefit is lost: it will confirm automatically.");
    } finally {
      setBusy("");
    }
  };

  const cancelPlacement = async () => {
    if (!overview?.promotion?.promotion_id) return;
    const confirmed = window.confirm(
      "End this placement now? Your free property page stays published, and no refund is issued automatically.",
    );
    if (!confirmed) return;
    setBusy("cancel");
    try {
      const res = await base44.functions.invoke("managePropertyPromotion", {
        action: "cancel_promotion",
        listingId,
        clientEmail,
        promotionId: overview.promotion.promotion_id,
      });
      const data = res?.data || res;
      setNotice(data?.message || "The placement has been ended.");
      await load();
      setMarketingKey((key) => key + 1);
    } catch (err) {
      setNotice(err.message || "That could not be completed.");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-8 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertCircle className="mr-2 inline h-4 w-4" />
        {error}
      </div>
    );
  }

  if (!overview) return null;

  const tierState = {
    activeTier: overview.entitlement?.active ? overview.entitlement.tier : "",
    canPurchase: overview.can_purchase === true,
    canUpgrade: overview.can_upgrade === true,
    canRenew: overview.can_renew === true,
    checkoutEnabled: overview.checkout_enabled === true,
    busy: !!busy,
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-serif text-2xl text-[#1A1A1A]">
          <Sparkles className="h-5 w-5 text-[#B8956A]" /> Marketing packages
        </h2>
        <p className="mt-1 text-sm text-[#1A1A1A]/55">
          Optional. Your free property page, its photographs and your leads are unaffected by any package you add or let end.
        </p>
      </div>

      {notice && (
        <div className="rounded-xl border border-[#B8956A]/35 bg-[#FFFBF5] px-4 py-3 text-sm text-[#1A1A1A]/75">{notice}</div>
      )}

      {overview.promotion && (
        <PromotionStatusCard
          promotion={overview.promotion}
          entitlement={overview.entitlement}
          busy={busy === "cancel"}
          onCancel={cancelPlacement}
        />
      )}

      {!overview.listing.purchasable && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {overview.listing.not_purchasable_reason} A package can only be added to a property page that is published and shown as
          available.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {overview.packages.map((pkg) => (
          <PackageTierCard
            key={pkg.tier}
            pkg={pkg}
            quote={overview.quotes?.[pkg.tier]}
            state={tierState}
            onSelect={buy}
          />
        ))}
      </div>

      {!overview.checkout_enabled && (
        <div className="rounded-xl border border-[#B8956A]/30 bg-[#FFFBF5] px-4 py-3 text-sm text-[#1A1A1A]/70">
          {overview.checkout_note}
        </div>
      )}

      <PropertyPerformancePanel performance={overview.performance} tier={overview.entitlement?.tier || "free"} />

      <MarketingAssetsPanel listingId={listingId} clientEmail={clientEmail} refreshKey={marketingKey} />

      <div className="rounded-2xl border border-[#B8956A]/20 bg-[#FFFBF5] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/45">Package terms</p>
        <ul className="mt-2 space-y-1">
          {(overview.refund_policy || []).map((line) => (
            <li key={line} className="text-[11px] leading-relaxed text-[#1A1A1A]/55">• {line}</li>
          ))}
          {(overview.disclosures || []).map((line) => (
            <li key={line} className="text-[11px] leading-relaxed text-[#1A1A1A]/45">• {line}</li>
          ))}
        </ul>
      </div>

      <PackageCheckoutDialog open={!!checkout} onOpenChange={(open) => { if (!open) setCheckout(null); }} checkout={checkout} onPaid={onPaid} />
    </div>
  );
}