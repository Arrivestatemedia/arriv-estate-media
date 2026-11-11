import React from "react";
import { Link, useLocation } from "react-router-dom";
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

const NAV = [
  { label: "Concierge", to: "/PreferredWorkspace", icon: Sparkles },
  { label: "Dashboard", to: "/ClientBookings", icon: LayoutDashboard },
  { label: "My Properties", to: "/PropertyLeads", icon: Building2 },
  { label: "Bookings", to: "/BookingPage", icon: CalendarClock },
  { label: "Galleries", to: "/ClientBookings", icon: Images },
  { label: "Marketing Growth", to: "/PropertyPageBuilder", icon: Megaphone },
  { label: "Analytics", to: "/VisibilityDashboard", icon: BarChart3 },
  { label: "Invoices & Billing", to: "/VisibilityDashboard", icon: Receipt },
  { label: "Membership", to: "/VisibilityDashboard", icon: BadgeCheck },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

export default function PreferredWorkspaceSidebar({ firstName }) {
  const location = useLocation();

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
          const active = location.pathname === item.to;
          return (
            <Link key={item.label} to={item.to} className="preferred-nav-item preferred-focus" data-active={active}>
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}