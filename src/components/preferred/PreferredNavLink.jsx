import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Crown } from "lucide-react";
import { usePreferred } from "@/components/preferred/PreferredProvider";

/**
 * The Concierge entry in the main nav — shown only when the signed-in customer's
 * Preferred entitlement resolved server-side.
 */
export default function PreferredNavLink({ onClick, mobile = false }) {
  const { preferred } = usePreferred();
  const location = useLocation();
  if (!preferred) return null;
  const active = location.pathname === "/PreferredWorkspace";
  return (
    <Link
      to="/PreferredWorkspace"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 ${mobile ? "py-2.5" : "py-2"} rounded-lg text-sm font-medium transition-all shrink-0 ${
        active
          ? "bg-[#B8956A] text-[#1A1A1A]"
          : "text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
      }`}
    >
      <Crown className="w-4 h-4" />
      Concierge
    </Link>
  );
}