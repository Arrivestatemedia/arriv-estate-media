import React from "react";
import { Crown } from "lucide-react";
import { usePreferred } from "@/components/preferred/PreferredProvider";

/**
 * Persistent Preferred identity in the portal header.
 * Renders nothing at all unless the server confirmed an active entitlement.
 */
export default function PreferredHeaderChip() {
  const { preferred, entitlement } = usePreferred();
  if (!preferred) return null;

  const plan = entitlement?.plan ? String(entitlement.plan).replace(/_/g, " ") : "Preferred";
  const renews = entitlement?.current_period_end
    ? new Date(entitlement.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  const title = [
    `${plan} member`,
    renews ? (entitlement?.cancel_at_period_end ? `access ends ${renews}` : `renews ${renews}`) : "",
  ].filter(Boolean).join(" · ");

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#c8a87c]/45 bg-[#c8a87c]/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[#d9bd95]"
    >
      <Crown className="h-3 w-3" />
      Preferred
    </span>
  );
}