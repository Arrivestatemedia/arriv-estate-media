import React, { useState } from "react";
import {
  LayoutDashboard, FolderOpen, Palette, Library as LibraryIcon,
  CreditCard, Settings as SettingsIcon, Menu, X, LayoutTemplate,
} from "lucide-react";
import StudioLogo from "@/components/studio/StudioLogo";
import StudioProductionMinutesCard from "@/components/studio/StudioProductionMinutesCard";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };

// Canonical Arriv Studio application shell — sidebar + content area.
// Matches Arriv Studio reference: #0f0f0f bg, #121212 sidebar, #331b1b active nav,
// #1a1a1a containers, coral #FF5A4F accents, white/a0a0a0 text.
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "flyers", label: "Flyers", icon: LayoutTemplate },
  { id: "brand_kits", label: "Brand Kits", icon: Palette },
  { id: "libraries", label: "Libraries", icon: LibraryIcon },
  { id: "usage", label: "Usage & Billing", icon: CreditCard },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function StudioShell({ entitlement, activeSection, onSectionChange, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleSelect = (id) => {
    onSectionChange(id);
    setMobileNavOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ ...STUDIO_FONT }}>
      {/* Studio Identity */}
      <div className="pl-2 pr-5 py-5 border-b" style={{ borderColor: "#2d2d2d" }}>
        <StudioLogo size={72} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? "#331b1b" : "transparent",
                color: active ? "#ffffff" : "#a0a0a0",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Production Minutes Card — bottom of sidebar */}
      <div className="px-3 pb-4">
        <StudioProductionMinutesCard entitlement={entitlement} />
      </div>
    </div>
  );

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 64px)", background: "#0f0f0f" }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col shrink-0"
        style={{ width: "256px", background: "#121212", borderRight: "1px solid #2d2d2d" }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar — slide-out drawer */}
      {mobileNavOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className="md:hidden fixed left-0 top-0 bottom-0 z-50 w-64 flex flex-col"
            style={{ background: "#121212", borderRight: "1px solid #2d2d2d" }}
          >
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-lg"
              style={{ color: "#a0a0a0" }}
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div
          className="md:hidden flex items-center gap-3 px-4 py-3 border-b"
          style={{ background: "#0f0f0f", borderColor: "#2d2d2d" }}
        >
          <button
            onClick={() => setMobileNavOpen(true)}
            className="p-1.5 rounded-lg"
            style={{ color: "#a0a0a0" }}
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold" style={{ color: "#ffffff" }}>
            {NAV_ITEMS.find((n) => n.id === activeSection)?.label || "Studio"}
          </span>
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto" style={{ background: "#0f0f0f" }}>
          {children}
        </div>
      </div>
    </div>
  );
}