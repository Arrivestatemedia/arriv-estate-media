import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, Wallet } from "lucide-react";
import PaymentRecoveryFlow from "@/components/customer/PaymentRecoveryFlow";
import AutoFundTierCard from "@/components/autofund/AutoFundTierCard";
import AutoFundEnrollPanel from "@/components/autofund/AutoFundEnrollPanel";
import AutoFundMembershipPanel from "@/components/autofund/AutoFundMembershipPanel";
import AutoFundAdminConsole from "@/components/autofund/AutoFundAdminConsole";

/**
 * Arriv Auto-Fund.
 *
 * Customers compare all five tiers, enroll themselves, ask for an advisor, and
 * manage their own membership. Every tier number on this page comes from the
 * canonical tier catalog the backend returns — nothing is hardcoded here, so the
 * interface can never show a stale deposit, bonus, membership fee or total charge.
 */
export default function AutoFund() {
  const [user, setUser] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("tiers");

  const [recoveryToken, setRecoveryToken] = useState(null);
  const [stripeSessionId, setStripeSessionId] = useState(null);
  const [recoveryStatus, setRecoveryStatus] = useState(null);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("recovery_token")) setRecoveryToken(params.get("recovery_token"));
    if (params.get("session_id")) setStripeSessionId(params.get("session_id"));
    if (params.get("recovery")) setRecoveryStatus(params.get("recovery"));
  }, []);

  const loadCatalog = async () => {
    const res = await base44.functions.invoke("manageAutoFund", { action: "get_tier_catalog" });
    const data = res?.data || res;
    if (Array.isArray(data?.tiers)) {
      setCatalog(data);
      setSelectedAmount(prev => prev ?? data.tiers[1]?.amount ?? data.tiers[0]?.amount ?? null);
    }
  };

  const loadMembership = async (email) => {
    if (!email) return;
    try {
      const res = await base44.functions.invoke("manageAutoFund", {
        action: "get_subscription",
        customer_email: email,
      });
      const data = res?.data || res;
      setMembership(data?.subscription ? data : null);
    } catch {
      setMembership(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await loadCatalog();
        let me = null;
        try { me = await base44.auth.me(); } catch { /* not signed in */ }
        setUser(me || null);
        if (me?.email) await loadMembership(me.email);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isAdmin = user?.role === "admin";
  const tiers = catalog?.tiers || [];
  const selectedTier = tiers.find(t => t.amount === selectedAmount) || null;
  const enrollmentOpen = catalog?.enrollment_open === true;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-serif text-[#1A1A1A] flex items-center gap-3">
            <RefreshCw className="w-7 h-7 text-[#B8956A]" />
            Arriv Auto-Fund
          </h1>
          <p className="text-sm text-[#1A1A1A]/60 mt-1">
            Add Booking Value to your Arriv Wallet every month, with a monthly bonus on top.
          </p>
        </div>

        {recoveryToken && !recoveryDismissed && (
          <div className="mb-8">
            <PaymentRecoveryFlow
              recoveryToken={recoveryToken}
              stripeSessionId={stripeSessionId}
              recoveryStatus={recoveryStatus}
              onDismiss={() => {
                setRecoveryDismissed(true);
                const url = new URL(window.location.href);
                url.searchParams.delete("recovery_token");
                url.searchParams.delete("session_id");
                url.searchParams.delete("recovery");
                window.history.replaceState({}, "", url.toString());
                loadMembership(user?.email);
              }}
            />
          </div>
        )}

        {isAdmin && (
          <div className="flex gap-2 mb-6">
            <Button variant={tab === "tiers" ? "default" : "outline"} size="sm"
              onClick={() => setTab("tiers")}
              className={tab === "tiers" ? "bg-[#B8956A] text-[#1A1A1A]" : "border-[#B8956A]/30 text-[#1A1A1A]"}>
              Customer view
            </Button>
            <Button variant={tab === "admin" ? "default" : "outline"} size="sm"
              onClick={() => setTab("admin")}
              className={tab === "admin" ? "bg-[#B8956A] text-[#1A1A1A]" : "border-[#B8956A]/30 text-[#1A1A1A]"}>
              Admin console
            </Button>
          </div>
        )}

        {isAdmin && tab === "admin" ? (
          <AutoFundAdminConsole catalog={tiers} />
        ) : (
          <>
            {membership && (
              <div className="mb-8">
                <AutoFundMembershipPanel
                  data={membership}
                  catalog={tiers}
                  onChanged={() => loadMembership(user?.email)}
                />
              </div>
            )}

            <h2 className="text-xl font-serif text-[#1A1A1A] mb-1">Five tiers</h2>
            <p className="text-sm text-[#1A1A1A]/60 mb-4">
              Pick a tier to see exactly what you'd pay and receive each month.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {tiers.map(tier => (
                <AutoFundTierCard
                  key={tier.amount}
                  tier={tier}
                  selected={selectedAmount === tier.amount}
                  onSelect={setSelectedAmount}
                />
              ))}
            </div>

            {user && selectedTier && !membership && (
              <AutoFundEnrollPanel
                tier={selectedTier}
                enrollmentOpen={enrollmentOpen}
                onEnrolled={() => loadMembership(user.email)}
              />
            )}

            {!user && (
              <Card className="border-[#B8956A]/20 bg-white">
                <CardContent className="pt-6 flex items-start gap-3">
                  <Wallet className="w-5 h-5 text-[#B8956A] mt-0.5 shrink-0" />
                  <p className="text-sm text-[#1A1A1A]/70">
                    Sign in to enroll and manage your Auto-Fund membership from your account dashboard.
                  </p>
                </CardContent>
              </Card>
            )}

            {catalog?.membership_fee_statement && (
              <p className="mt-6 text-xs text-[#1A1A1A]/50">{catalog.membership_fee_statement}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}