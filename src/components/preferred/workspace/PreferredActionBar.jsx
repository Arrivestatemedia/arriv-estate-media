import React from "react";
import { BarChart3, Building2, Camera, Images, Megaphone, Receipt } from "lucide-react";
import { usePreferredSurface } from "@/components/preferred/surface/PreferredSurfaceContext";
import { SURFACES } from "@/components/preferred/surface/surfaces";

const ACTIONS = [
  { label: "Book a Shoot", surface: "booking", icon: Camera },
  { label: "Create Property Page", surface: "marketing", icon: Building2 },
  { label: "Promote a Listing", surface: "marketing", icon: Megaphone },
  { label: "Show My Analytics", surface: "analytics", icon: BarChart3 },
  { label: "Open My Gallery", surface: "galleries", icon: Images },
  { label: "Pay an Invoice", surface: "billing", icon: Receipt },
];

export default function PreferredActionBar() {
  const { open } = usePreferredSurface();

  return (
    <div className="preferred-glass grid grid-cols-2 gap-1 p-2 sm:grid-cols-3 lg:grid-cols-6">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            type="button"
            onClick={() => open(action.surface, { hash: SURFACES[action.surface]?.hash })}
            className="preferred-focus flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-[11.5px] font-medium leading-tight text-[#f6f1e8]/90 transition-colors hover:bg-[#c8a87c]/16 hover:text-[#fffdf9]"
          >
            <Icon className="h-4 w-4 text-[#ddc09a]" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}