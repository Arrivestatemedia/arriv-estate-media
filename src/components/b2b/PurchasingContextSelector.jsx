import React, { useEffect, useState } from "react";
import { Building2, User, Loader2, Lock } from "lucide-react";
import {
  loadPurchasingContexts,
  authorizeContext,
  getStoredContext,
  storeContext,
  clearStoredContext,
} from "@/lib/purchasingContext";

/**
 * "Ordering as …" selector.
 *
 * Shows only when the signed-in person actually belongs to a company account.
 * Nothing is assumed: the customer picks, the server authorizes the pick, and the
 * choice is remembered per person. While a company is selected, its own credit
 * pool is displayed so the difference from personal credits is never a surprise.
 */
export default function PurchasingContextSelector({ email, onChange, className = "" }) {
  const [contexts, setContexts] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await loadPurchasingContexts();
        if (cancelled) return;
        setContexts(data);

        const stored = getStoredContext(email);
        const organizations = data?.organizations || [];
        const hasUsable = organizations.some((o) => o.authorized && o.can_order);

        if (stored?.type === "organization") {
          const match = organizations.find((o) => o.organization_id === stored.organization_id);
          if (match?.authorized && match?.can_order) {
            setSelected(match);
            onChange?.(match, { hasOrganizations: true });
            return;
          }
          clearStoredContext(email);
        }

        if (!hasUsable) {
          const personal = data?.personal || { type: "personal" };
          setSelected(personal);
          storeContext(email, { type: "personal" });
          onChange?.(personal, { hasOrganizations: false });
          return;
        }

        // A real company option exists: the customer must choose. Nothing is
        // preselected, so no order can commit against an assumed account.
        setSelected(null);
        onChange?.(null, { hasOrganizations: true });
      } catch (e) {
        if (!cancelled) setError(e.message || "Could not load your accounts.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [email]);

  const choose = async (context) => {
    setError("");
    setBusy(true);
    try {
      if (context.type === "personal") {
        const personal = contexts?.personal || { type: "personal" };
        storeContext(email, { type: "personal" });
        setSelected(personal);
        onChange?.(personal, { hasOrganizations: true });
      } else {
        const authorized = await authorizeContext(context.organization_id);
        if (!authorized?.can_order) {
          setError(authorized?.reason || "That company account cannot be used right now.");
          setBusy(false);
          return;
        }
        storeContext(email, { type: "organization", organization_id: authorized.organization_id });
        setSelected(authorized);
        onChange?.(authorized, { hasOrganizations: true });
      }
    } catch (e) {
      setError(e.message || "That account cannot be used right now.");
    }
    setBusy(false);
  };

  if (error && !contexts) {
    return (
      <div className={`rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 ${className}`}>
        {error}
      </div>
    );
  }

  if (!contexts) {
    return (
      <div className={`flex items-center gap-2 text-sm text-[var(--text-secondary)] ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin text-[#B8956A]" />
        Checking your accounts…
      </div>
    );
  }

  const organizations = contexts.organizations || [];
  if (organizations.length === 0) return null;

  const orgSelected = selected?.type === "organization";

  return (
    <section
      className={`rounded-2xl border border-[#B8956A]/25 bg-[var(--card-bg)] p-4 ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-[var(--text-primary)]">Ordering as</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Choose before you book. Crediting, pricing and billing follow this choice.
          </p>
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-[#B8956A]" />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => choose({ type: "personal" })}
          disabled={busy}
          className={`text-left rounded-xl border p-3 transition-all ${
            selected?.type === "personal"
              ? "border-[#B8956A] bg-[#B8956A]/10"
              : "border-[#B8956A]/25 hover:border-[#B8956A]/60"
          }`}
        >
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#B8956A]" />
            <span className="font-medium text-[var(--text-primary)]">Myself</span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Your own bookings, prepaid wallet and Auto-Fund credits.
          </p>
        </button>

        {organizations.map((org) => {
          const usable = org.authorized && org.can_order;
          const isSelected = orgSelected && selected?.organization_id === org.organization_id;
          return (
            <button
              key={org.organization_id}
              type="button"
              onClick={() => usable && choose(org)}
              disabled={busy || !usable}
              className={`text-left rounded-xl border p-3 transition-all ${
                isSelected
                  ? "border-[#B8956A] bg-[#B8956A]/10"
                  : usable
                  ? "border-[#B8956A]/25 hover:border-[#B8956A]/60"
                  : "border-[var(--border-color)] opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#B8956A]" />
                <span className="font-medium text-[var(--text-primary)] truncate">
                  {org.organization_name || "Company account"}
                </span>
                {!usable && <Lock className="w-3 h-3 text-[var(--text-secondary)] ml-auto" />}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {org.member_role === "admin" ? "Company administrator" : org.member_role === "booking_only" ? "Booking access" : "Team member"}
              </p>
              {usable && org.credits?.available !== null && org.credits?.available !== undefined && (
                <p className="mt-1 text-xs font-medium text-[#B8956A]">
                  {Number(org.credits.available).toLocaleString()} {org.credits.unit_label} available
                </p>
              )}
              {!usable && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {org.reason || "Not available for ordering."}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {orgSelected && selected?.credits?.available !== null && selected?.credits?.available !== undefined && (
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          Company pool: {Number(selected.credits.available).toLocaleString()} {selected.credits.unit_label} available
          {selected.credits.period_end ? ` · resets ${selected.credits.period_end}` : ""}. Your personal prepaid and
          Auto-Fund credits are not used for company orders.
        </p>
      )}
    </section>
  );
}