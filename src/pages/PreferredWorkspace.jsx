import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { withCustomerSession } from "@/lib/customerSession";
import { usePreferred } from "@/components/preferred/PreferredProvider";
import PreferredWorkspaceSidebar from "@/components/preferred/workspace/PreferredWorkspaceSidebar";
import PreferredConciergeStage from "@/components/preferred/workspace/PreferredConciergeStage";
import PreferredWorkspaceRail from "@/components/preferred/workspace/PreferredWorkspaceRail";
import PreferredActionBar from "@/components/preferred/workspace/PreferredActionBar";
import PreferredWelcomeLoading from "@/components/preferred/workspace/PreferredWelcomeLoading";

/**
 * The Arriv Preferred member workspace: the concierge representative front and centre,
 * the member's own numbers beside it, and the six things they do most underneath.
 */
export default function PreferredWorkspace() {
  const { preferred, loading, entitlement, customer, refresh } = usePreferred();
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState("");
  // Arriving straight from checkout: the membership is still being activated, so the
  // customer gets their welcome instead of a portal that looks unchanged.
  const [welcoming, setWelcoming] = useState(
    () => new URLSearchParams(window.location.search).get("preferred") === "success"
  );

  useEffect(() => {
    if (loading || !preferred) return undefined;
    let cancelled = false;
    base44.functions
      .invoke("getPreferredWorkspace", withCustomerSession({}))
      .then((response) => {
        if (cancelled) return;
        const payload = response?.data ?? response;
        if (payload?.ok) setData(payload);
        else setFailure("Your numbers couldn't be loaded just now.");
      })
      .catch(() => {
        if (!cancelled) setFailure("Your numbers couldn't be loaded just now.");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, preferred]);

  const finishWelcome = useCallback(() => {
    setWelcoming(false);
    const params = new URLSearchParams(window.location.search);
    params.delete("preferred");
    const query = params.toString();
    window.history.replaceState({}, "", `/PreferredWorkspace${query ? `?${query}` : ""}`);
  }, []);

  useEffect(() => {
    if (!welcoming) return undefined;
    refresh();
    const timer = setInterval(() => refresh(), 2500);
    return () => clearInterval(timer);
  }, [welcoming, refresh]);

  if (welcoming) {
    return (
      <PreferredWelcomeLoading
        firstName={customer?.first_name || String(customer?.full_name || "").split(" ")[0] || ""}
        ready={preferred}
        onDone={finishWelcome}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#c8a87c]" />
      </div>
    );
  }

  if (!preferred) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#B8956A]/40 bg-[#B8956A]/10">
          <Crown className="h-5 w-5 text-[#B8956A]" />
        </span>
        <h1 className="font-serif text-3xl text-[#1A1A1A]">The concierge is a Preferred benefit</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#1A1A1A]/60">
          Preferred members work with a dedicated Arriv concierge who books, publishes and manages
          your marketing for you. Your current portal keeps working exactly as it does today.
        </p>
        <Link
          to="/VisibilityDashboard"
          className="mt-6 inline-flex rounded-full bg-[#B8956A] px-6 py-2.5 text-sm font-medium text-[#1A1A1A]"
        >
          See Preferred membership
        </Link>
      </div>
    );
  }

  const firstName = data?.customer?.first_name
    || customer?.first_name
    || String(customer?.full_name || "").split(" ")[0]
    || "";

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-5 lg:grid-cols-[218px_minmax(0,1fr)_296px]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <PreferredWorkspaceSidebar firstName={firstName} />
        </div>

        <div className="min-w-0">
          <PreferredConciergeStage
            customer={{ first_name: firstName }}
            conciergeName={data?.concierge_name || ""}
          />
          {failure && (
            <p className="mt-3 rounded-xl border border-[#c8a87c]/20 bg-black/25 px-3 py-2 text-[11.5px] text-[#f6f1e8]/50">
              {failure}
            </p>
          )}
        </div>

        <PreferredWorkspaceRail
          stats={data?.stats}
          latestMedia={data?.latest_media}
          plan={data?.plan || entitlement?.plan}
          periodEnd={data?.period_end || entitlement?.current_period_end}
        />
      </div>

      <div className="mt-5">
        <PreferredActionBar />
      </div>
    </div>
  );
}