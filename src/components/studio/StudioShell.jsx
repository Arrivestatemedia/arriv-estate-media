import React, { useState } from "react";
import {
  LayoutDashboard, FolderOpen, Palette, Library as LibraryIcon,
  CreditCard, Settings as SettingsIcon, Menu, X,
} from "lucide-react";
import StudioLogo from "@/components/studio/StudioLogo";
import StudioProductionMinutesCard from "@/components/studio/StudioProductionMinutesCard";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };

// Canonical Arriv Studio application shell — 256px sidebar + content area.
// Background #111111, panels #1C1C1F, text #FAF8F5, coral #FF5A4F accents.
// Sidebar: Studio identity, navigation, production minutes card at bottom.
// Responsive: full sidebar on desktop, slide-out drawer on mobile.
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: FolderOpen },
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
      <div className="px-5 py-5 border-b" style={{ borderColor: "rgba(250,248,245,0.06)" }}>
        <StudioLogo size={32} />
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
                background: active ? "rgba(255,90,79,0.15)" : "transparent",
                color: active ? "#FF5A4F" : "rgba(250,248,245,0.5)",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(250,248,245,0.04)"; }}
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
    <div className="flex" style={{ minHeight: "calc(100vh - 64px)", background: "#111111" }}>
      {/* Desktop sidebar — 256px fixed */}
      <aside
        className="hidden md:flex flex-col shrink-0"
        style={{ width: "256px", background: "#0D0D0D", borderRight: "1px solid rgba(250,248,245,0.06)" }}
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
            style={{ background: "#0D0D0D", borderRight: "1px solid rgba(250,248,245,0.06)" }}
          >
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-lg"
              style={{ color: "rgba(250,248,245,0.5)" }}
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
          style={{ background: "#111111", borderColor: "rgba(250,248,245,0.06)" }}
        >
          <button
            onClick={() => setMobileNavOpen(true)}
            className="p-1.5 rounded-lg"
            style={{ color: "rgba(250,248,245,0.6)" }}
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold" style={{ color: "#FAF8F5" }}>
            {NAV_ITEMS.find((n) => n.id === activeSection)?.label || "Studio"}
          </span>
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto" style={{ background: "#111111" }}>
          {children}
        </div>
      </div>
    </div>
  );
}