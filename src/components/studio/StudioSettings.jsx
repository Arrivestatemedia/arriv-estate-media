import React from "react";
import { User, Mail, CreditCard, ExternalLink } from "lucide-react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

// Studio Settings — canonical Studio settings panel.
export default function StudioSettings({ entitlement, onManageSubscription }) {
  const clientEmail = localStorage.getItem("user_email") || sessionStorage.getItem("user_email") || "";
  const clientName = localStorage.getItem("user_name") || sessionStorage.getItem("user_name") || "";

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8" style={{ ...STUDIO_FONT }}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: C.text }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: C.muted }}>Manage your Arriv Studio account and preferences.</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: C.muted }}>Account</h2>
        <div className="rounded-xl divide-y" style={{ background: C.container, border: `1px solid ${C.border}`, borderColor: C.border }}>
          <div className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,90,79,0.1)" }}>
              <User className="w-4 h-4" style={{ color: C.accent }} />
            </div>
            <div className="flex-1">
              <p className="text-xs" style={{ color: C.muted }}>Name</p>
              <p className="text-sm font-medium" style={{ color: C.text }}>{clientName || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4" style={{ borderColor: C.border }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,90,79,0.1)" }}>
              <Mail className="w-4 h-4" style={{ color: C.accent }} />
            </div>
            <div className="flex-1">
              <p className="text-xs" style={{ color: C.muted }}>Email</p>
              <p className="text-sm font-medium" style={{ color: C.text }}>{clientEmail || "—"}</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: C.muted }}>Subscription</h2>
        <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,90,79,0.1)" }}>
              <CreditCard className="w-4 h-4" style={{ color: C.accent }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: C.text }}>{entitlement?.plan_name || "Studio for Real Estate"}</p>
              <p className="text-xs" style={{ color: C.muted }}>{entitlement?.minutes_remaining ?? 0} min remaining this month</p>
            </div>
          </div>
          {onManageSubscription && (
            <button
              onClick={onManageSubscription}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
              style={{ background: "rgba(255,90,79,0.1)", color: C.accent, border: "1px solid rgba(255,90,79,0.2)" }}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Manage in Arriv Studio
            </button>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: C.muted }}>Studio Preferences</h2>
        <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
          <p className="text-sm" style={{ color: C.muted }}>
            Brand Kits, presenter defaults, voice preferences, and music libraries are managed
            directly in Arriv Studio. Use the sidebar to open Brand Kits or Libraries.
          </p>
        </div>
      </section>
    </div>
  );
}