import React from "react";
import { Link } from "react-router-dom";
import { BarChart3, Building2, Camera, Images, Megaphone, Receipt } from "lucide-react";

const ACTIONS = [
  { label: "Book a Shoot", to: "/BookingPage", icon: Camera },
  { label: "Create Property Page", to: "/PropertyPageBuilder", icon: Building2 },
  { label: "Promote a Listing", to: "/PropertyPageBuilder", icon: Megaphone },
  { label: "Show My Analytics", to: "/VisibilityDashboard", icon: BarChart3 },
  { label: "Open My Gallery", to: "/ClientBookings", icon: Images },
  { label: "Pay an Invoice", to: "/VisibilityDashboard", icon: Receipt },
];

export default function PreferredActionBar() {
  return (
    <div className="preferred-glass grid grid-cols-2 gap-1 p-2 sm:grid-cols-3 lg:grid-cols-6">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.label}
            to={action.to}
            className="preferred-focus flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-[11px] leading-tight text-[#f6f1e8]/65 transition-colors hover:bg-[#c8a87c]/10 hover:text-[#f6f1e8]"
          >
            <Icon className="h-4 w-4 text-[#c8a87c]" />
            {action.label}
          </Link>
        );
      })}
    </div>
  );
}