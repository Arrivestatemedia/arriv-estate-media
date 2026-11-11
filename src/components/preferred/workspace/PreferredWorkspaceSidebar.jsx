import React from "react";
import {
  BarChart3,
  BadgeCheck,
  Building2,
  CalendarClock,
  Crown,
  Images,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Sparkles,
} from "lucide-react";
import { usePreferredSurface } from "@/components/preferred/surface/PreferredSurfaceContext";
import { SURFACES } from "@/components/preferred/surface/surfaces";

const NAV = [
  { label: "Concierge", surface: null, icon: Sparkles },
  { label: "Dashboard", surface: "dashboard", icon: LayoutDashboard },
  { label: "My Properties", surface: "properties", icon: Building2 },
  { label: "Bookings", surface: "booking", icon: CalendarClock },
  { label: "Galleries", surface: "galleries", icon: Images },
  { label: "Marketing Growth", surface: "marketing", icon: Megaphone },
  { label: "Analytics", surface: "analytics", icon: BarChart3 },
  { label: "Invoices & Billing", surface: "billing", icon: Receipt },
  { label: "Membership", surface: "membership", icon: BadgeCheck },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

export default function PreferredWorkspaceSidebar({ firstName }) {
  const { active, open, close } = usePreferredSurface();

  return (
    <aside className="preferred-glass h-fit p-3">
      <div className="px-2 pb-3 pt-1">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.28em] text-[#c8a87c]">
          <Crown className="h-3 w-3" /> Arriv Preferred
        </p>
        <h2 className="preferred-gold-text mt-1.5 font-serif text-xl leading-tight">
          {greeting()}{firstName ? `, ${firstName}` : ""}
        </h2>
      </div>
      <nav className="preferred-scroll space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.surface ? active?.key === item.surface : !active;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => (item.surface ? open(item.surface, { hash: SURFACES[item.surface]?.hash }) : close())}
              className="preferred-nav-item preferred-focus w-full text-left"
              data-active={isActive}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}