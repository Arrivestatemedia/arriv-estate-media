import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Loader2 } from "lucide-react";

/**
 * Preferred Membership inside the customer's billing area.
 *
 * It only reads and starts the membership that already exists — the same
 * checkPreferredMembership / createPreferredMembership flow, no parallel membership system and no
 * local pricing. Nothing is granted here: the membership becomes active from Stripe's webhook.
 */
const BENEFITS = [
  "10% off all media services",
  "$5 off MLS walkthroughs",
  "Enhanced referral rewards",
];

export default function PreferredMembershipCard({ email }) {
  const [state, setState] = useState({ loading: true, active: false, membership: null });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!email) {
        setState({ loading: false, active: false, membership: null });
        return;
      }
      try {
        const res = await base44.functions.invoke("checkPreferredMembership", { client_email: email });
        const data = res?.data || res;
        if (cancelled) return;
        setState({
          loading: false,
          active: !!data?.is_preferred,
          membership: data?.membership || null,
        });
      } catch {
        if (!cancelled) setState({ loading: false, active: false, membership: null });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function activate() {
    setError("");
    setStarting(true);
    try {
      const accountRes = await base44.functions.invoke("getMyAccount", {});
      const account = accountRes?.data?.account || accountRes?.data || {};
      const clientId = account?.id || account?.account_id || "";
      if (!clientId) {
        setError("Your account could not be found. Please sign in again.");
        return;
      }
      const res = await base44.functions.invoke("createPreferredMembership", {
        client_id: clientId,
        client_email: email,
        client_name: account?.full_name || "",
      });
      const data = res?.data || res;
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setError(data?.error || "Membership checkout could not be started.");
    } catch (err) {
      setError(err?.message || "Membership checkout could not be started.");
    } finally {
      setStarting(false);
    }
  }

  const periodEnd = state.membership?.current_period_end;

  return (
    <div className="rounded-2xl border border-[#B8956A]/25 bg-[var(--card-bg)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#B8956A]/12 flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-[#B8956A]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--text-primary)]">Preferred Membership</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              A monthly membership that lowers the cost of everything else.
            </p>
          </div>
        </div>
        {!state.loading && (
          <Badge
            variant="outline"
            className={
              state.active
                ? "border-[#B8956A] text-[#B8956A] bg-[#B8956A]/10"
                : "border-[var(--border-color)] text-[var(--text-secondary)]"
            }
          >
            {state.active ? "Active" : "Not active"}
          </Badge>
        )}
      </div>

      <ul className="mt-4 space-y-1.5">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="text-sm text-[var(--text-secondary)]">
            {benefit}
          </li>
        ))}
      </ul>

      {state.loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking your membership
        </div>
      ) : state.active ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          Your membership is active
          {periodEnd ? ` — renews ${new Date(periodEnd).toLocaleDateString()}` : ""}.
          {state.membership?.cancel_at_period_end ? " It will end at the close of the current period." : ""}
        </p>
      ) : (
        <div className="mt-4">
          <Button
            onClick={activate}
            disabled={starting}
            className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {starting ? "Opening checkout" : "Join Preferred Membership"}
          </Button>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Billed monthly through Stripe. You can cancel from your membership at any time.
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}