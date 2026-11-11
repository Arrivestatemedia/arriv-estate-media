import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, Megaphone } from "lucide-react";
import { adAction, money } from "@/lib/propertyAds";
import AdPackageCard from "./AdPackageCard";
import AdCreativeApproval from "./AdCreativeApproval";
import AdCampaignStatusCard from "./AdCampaignStatusCard";
import AdCheckoutDialog from "./AdCheckoutDialog";

// The server-side policy strings carry a brand placeholder; the customer must read a real sentence.
function brandCopy(text) {
  return String(text || "").replace(/\*{6}/g, "Arriv");
}

// Arriv-managed advertising for ONE property page: choose a package, approve the exact creative and
// budget, pay once, then follow the campaign and its platform-reported results.
//
// The customer never sees an unverified claim: whether a campaign can be bought, approved, launched or
// reported is decided server-side on every call, and this panel only renders what came back.
export default function PropertyAdPanel({ listing, clientEmail }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyTier, setBusyTier] = useState("");
  const [draft, setDraft] = useState(null);
  const [checkout, setCheckout] = useState(null);

  const listingId = listing?.listing_id || "";

  const load = useCallback(async () => {
    if (!listingId || !clientEmail) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await adAction("overview", { listingId, clientEmail });
      if (data?.ok === false) setError(data.message || "Advertising could not be loaded.");
      else setOverview(data);
    } catch (err) {
      setError(err.message || "Advertising could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [listingId, clientEmail]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = async (tier) => {
    setBusyTier(tier);
    setNotice("");
    try {
      const data = await adAction("prepare", { listingId, clientEmail, tier });
      if (data?.ok === false) {
        setNotice([data.message || "That campaign could not be prepared.", ...(data.blockers || [])].join(" "));
        return;
      }
      setDraft(data.campaign);
    } catch (err) {
      setNotice(err.message || "That campaign could not be prepared.");
    } finally {
      setBusyTier("");
    }
  };

  const approveAndPay = async () => {
    if (!draft?.campaign_id) return;
    setBusyTier(draft.package_tier || "draft");
    setNotice("");
    try {
      const authorized = await adAction("authorize", { listingId, clientEmail, campaignId: draft.campaign_id, confirmed: true });
      if (authorized?.ok === false) {
        setNotice(authorized.message || "That approval could not be recorded.");
        return;
      }
      const approved = await adAction("approve", { listingId, clientEmail, campaignId: draft.campaign_id });
      if (approved?.ok === false) {
        setNotice([approved.message || approved.error || "That approval could not be recorded.", ...(approved.blockers || [])].join(" "));
        return;
      }
      const purchase = await adAction("start_purchase", { listingId, clientEmail, campaignId: draft.campaign_id });
      if (purchase?.ok === false) {
        setNotice(purchase.message || "The payment could not be started.");
        return;
      }
      setDraft(null);
      setCheckout({
        clientSecret: purchase.client_secret,
        amountLabel: money(purchase.amount_cents),
        packageName: approved.campaign?.package_name || draft.package_name,
        durationDays: approved.campaign?.duration_days || 7,
        campaignId: purchase.campaign_id,
      });
    } catch (err) {
      setNotice(err.message || "That could not be completed.");
    } finally {
      setBusyTier("");
    }
  };

  const onPaid = async (paymentIntentId) => {
    setCheckout(null);
    setBusyTier("confirm");
    try {
      const data = await adAction("confirm_purchase", { listingId, clientEmail, campaignId: draft?.campaign_id, paymentIntentId });
      setNotice(
        data?.ok === false
          ? data.message || "The payment could not be confirmed yet. It will confirm automatically."
          : "Card saved. Nothing is charged until your property page is approved and the campaign starts.",
      );
      await load();
    } catch (err) {
      setNotice(err.message || "The payment could not be confirmed yet. It will confirm automatically.");
    } finally {
      setBusyTier("");
    }
  };

  const endCampaign = async () => {
    const campaign = overview?.campaign;
    if (!campaign?.campaign_id) return;
    if (!window.confirm("End this campaign now? Your property page stays published. Refunds follow the advertising policy below.")) return;
    setBusyTier("cancel");
    try {
      const data = await adAction("cancel", { listingId, clientEmail, campaignId: campaign.campaign_id });
      setNotice(data?.message || "The campaign has been ended.");
      await load();
    } catch (err) {
      setNotice(err.message || "That could not be completed.");
    } finally {
      setBusyTier("");
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

  const purchasable = overview.listing?.purchasable !== false;
  // A page still in draft can carry a paid campaign that starts later; what the banner says has to
  // match what is actually possible.
  const startsLater = purchasable && overview.listing?.live_now !== true;
  const paidDays = overview.packages?.[0]?.durationDays || overview.campaign?.duration_days || 7;
  const state = {
    activeTier: overview.campaign?.status === "ACTIVE" ? overview.campaign.package_tier : "",
    canPurchase: overview.checkout_enabled === true && purchasable,
    busy: !!busyTier,
    busyTier,
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-serif text-2xl text-[#1A1A1A]">
          <Megaphone className="h-5 w-5 text-[#B8956A]" /> Arriv managed advertising
        </h2>
        <p className="mt-1 text-sm text-[#1A1A1A]/55">
          We build the ad, run it in our own advertising accounts and report what the platform reports. Separate from your property
          page, which stays published regardless.
        </p>
      </div>

      {notice && <div className="rounded-xl border border-[#B8956A]/35 bg-[#FFFBF5] px-4 py-3 text-sm text-[#1A1A1A]/75">{notice}</div>}

      {overview.campaign && <AdCampaignStatusCard campaign={overview.campaign} busy={!!busyTier} onCancel={endCampaign} onRefresh={load} />}

      {draft ? (
        <AdCreativeApproval
          campaign={draft}
          packagePriceCents={draft.total_cents}
          busy={busyTier === draft.package_tier || busyTier === "draft"}
          onApprove={approveAndPay}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {(overview.packages || []).map((pkg) => (
            <AdPackageCard key={pkg.tier} pkg={pkg} state={state} onSelect={pick} />
          ))}
        </div>
      )}

      {!purchasable && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {[...(overview.listing?.purchase_blockers || []), ...(overview.listing?.blockers || [])].join(" ")}
        </div>
      )}

      {startsLater && (
        <div className="rounded-xl border border-[#B8956A]/35 bg-[#FFFBF5] px-4 py-3 text-sm leading-relaxed text-[#1A1A1A]/75">
          You can choose and reserve a campaign now. Nothing is charged today: your card is held and charged only once your
          property page is approved and the campaign starts running. The {paidDays} days begin on the day it launches, not on
          the day you reserve it.
          {(overview.listing?.blockers || []).length > 0 && (
            <span className="mt-1 block text-xs text-[#1A1A1A]/55">Still needed: {(overview.listing?.blockers || []).join(" ")}</span>
          )}
        </div>
      )}

      {overview.checkout_enabled && !overview.provider_readiness?.publishing_available && (
        <div className="rounded-xl border border-[#B8956A]/30 bg-[#FFFBF5] px-4 py-3 text-xs leading-relaxed text-[#1A1A1A]/70">
          {overview.provider_readiness?.connected
            ? "Advertising delivery is not switched on for this account yet."
            : "Our advertising account is not connected yet, so live delivery is not available at this moment."}{" "}
          Your campaign waits for a launch window, and the refund policy below applies if it cannot run.
        </div>
      )}

      {(overview.history || []).length > 0 && (
        <div className="rounded-2xl border border-[#B8956A]/20 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/45">Earlier campaigns</p>
          <ul className="mt-2 divide-y divide-[#B8956A]/15">
            {overview.history.map((item) => (
              <li key={item.campaign_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-[#1A1A1A]/65">
                <span className="font-medium text-[#1A1A1A]">{item.package_name}</span>
                <span>{item.status_label}</span>
                <span>{money(item.spent_cents)} spent of {money(item.ad_budget_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-[#B8956A]/20 bg-[#FFFBF5] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/45">How advertising works here</p>
        <ul className="mt-2 space-y-1">
          {(overview.authorization_points || []).map((line) => (
            <li key={line} className="text-[11px] leading-relaxed text-[#1A1A1A]/60">• {brandCopy(line)}</li>
          ))}
          {(overview.refund_policy || []).map((line) => (
            <li key={line} className="text-[11px] leading-relaxed text-[#1A1A1A]/50">• {line}</li>
          ))}
          {overview.disclosure && <li className="text-[11px] leading-relaxed text-[#1A1A1A]/45">• {brandCopy(overview.disclosure)}</li>}
        </ul>
      </div>

      <AdCheckoutDialog
        open={!!checkout}
        onOpenChange={(open) => {
          if (!open) setCheckout(null);
        }}
        checkout={checkout}
        onPaid={onPaid}
      />
    </div>
  );
}