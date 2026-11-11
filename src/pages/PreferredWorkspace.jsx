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
import PreferredSurfacePanel from "@/components/preferred/workspace/PreferredSurfacePanel";
import PreferredWelcomeLoading from "@/components/preferred/workspace/PreferredWelcomeLoading";
import { usePreferredSurface } from "@/components/preferred/surface/PreferredSurfaceContext";

// One reveal per page load: a login or a refresh replays it, moving around the
// workspace afterwards does not. A reload resets this module.
let revealPlayed = false;

/**
 * The Arriv Preferred member workspace: the concierge representative front and centre,
 * the member's own numbers beside it, and the six things they do most underneath.
 */
export default function PreferredWorkspace() {
  const { preferred, loading, entitlement, customer, refresh } = usePreferred();
  // A workspace the member is working in: she steps back, it opens beside her.
  const { active: activeSurface } = usePreferredSurface();
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState("");
  const [starting, setStarting] = useState(false);
  // Every visit — a login or a refresh — starts with the branded loading screen while the
  // membership is confirmed. Arriving straight from checkout keeps it up until activation.
  const fromCheckout = new URLSearchParams(window.location.search).get("preferred") === "success";
  const [welcoming, setWelcoming] = useState(!revealPlayed);
  const showWelcome = welcoming && (fromCheckout || loading || preferred);

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

  // On this page the concierge is part of the layout, not a floating pip: it collapses into
  // the working grid instead of hovering over it.
  useEffect(() => {
    document.body.classList.add("preferred-inline-stage");
    return () => document.body.classList.remove("preferred-inline-stage");
  }, []);

  const finishWelcome = useCallback(() => {
    revealPlayed = true;
    setWelcoming(false);
    const params = new URLSearchParams(window.location.search);
    params.delete("preferred");
    const query = params.toString();
    window.history.replaceState({}, "", `/PreferredWorkspace${query ? `?${query}` : ""}`);
  }, []);

  useEffect(() => {
    if (!showWelcome) return undefined;
    refresh();
    const timer = setInterval(() => refresh(), 2500);
    return () => clearInterval(timer);
  }, [showWelcome, refresh]);

  if (showWelcome) {
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

  async function startMembership() {
    setStarting(true);
    setFailure("");
    try {
      // The account and email come from the signed customer session, never from the page.
      const response = await base44.functions.invoke("createPreferredMembership", withCustomerSession({}));
      const payload = response?.data ?? response;
      if (payload?.checkout_url) {
        window.location.href = payload.checkout_url;
        return;
      }
      refresh();
    } catch (err) {
      setFailure(err?.message || "Membership checkout could not be started.");
    } finally {
      setStarting(false);
    }
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
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={startMembership}
            disabled={starting}
            className="inline-flex items-center gap-2 rounded-full bg-[#B8956A] px-6 py-2.5 text-sm font-medium text-[#1A1A1A] disabled:opacity-60"
          >
            {starting && <Loader2 className="h-4 w-4 animate-spin" />}
            {starting ? "Opening checkout" : "Become Preferred"}
          </button>
          <Link
            to="/VisibilityDashboard"
            className="text-xs font-medium text-[#1A1A1A]/50 underline underline-offset-4"
          >
            See Preferred membership
          </Link>
        </div>
        {failure && <p className="mt-4 text-xs text-red-600">{failure}</p>}
      </div>
    );
  }

  const firstName = data?.customer?.first_name
    || customer?.first_name
    || String(customer?.full_name || "").split(" ")[0]
    || "";

  const working = Boolean(activeSurface);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      {/* The workspace transforms around the conversation: while she is working on something
          her panel narrows to one column and the screen she opened takes the rest. Her panel
          is mounted in the same slot in both states, so the video is never restarted. */}
      <div
        className={`grid gap-5 transition-[grid-template-columns] duration-500 ${
          working
            ? "lg:grid-cols-[206px_minmax(0,296px)_minmax(0,1fr)]"
            : "lg:grid-cols-[218px_minmax(0,1fr)_296px]"
        }`}
      >
        <div className={`lg:sticky lg:top-20 lg:self-start ${working ? "hidden lg:block" : ""}`}>
          <PreferredWorkspaceSidebar firstName={firstName} />
        </div>

        <div className={`min-w-0 ${working ? "lg:sticky lg:top-20 lg:self-start" : ""}`}>
          <PreferredConciergeStage
            customer={{ first_name: firstName }}
            conciergeName={data?.concierge_name || ""}
          />
          {failure && (
            <p className="mt-3 rounded-xl border border-[#c8a87c]/25 bg-black/30 px-3 py-2 text-[11.5px] text-[#f6f1e8]/70">
              {failure}
            </p>
          )}
        </div>

        {working ? (
          <PreferredSurfacePanel />
        ) : (
          <PreferredWorkspaceRail
            stats={data?.stats}
            latestMedia={data?.latest_media}
            plan={data?.plan || entitlement?.plan}
            periodEnd={data?.period_end || entitlement?.current_period_end}
          />
        )}
      </div>

      <div className="mt-5">
        <PreferredActionBar />
      </div>
    </div>
  );
}