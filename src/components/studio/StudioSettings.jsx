import React from "react";
import { User, Mail, CreditCard, ExternalLink } from "lucide-react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };

// Studio Settings — canonical Studio settings panel.
// Shows account info, subscription management link, and Studio preferences.
// Subscription management delegates to canonical Studio via iframe deep-link.
export default function StudioSettings({ entitlement, onManageSubscription }) {
  const clientEmail = localStorage.getItem("user_email") || sessionStorage.getItem("user_email") || "";
  const clientName = localStorage.getItem("user_name") || sessionStorage.getItem("user_name") || "";

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8" style={{ ...STUDIO_FONT }}>
      {/* Page heading */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "#FAF8F5" }}>
          Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(250,248,245,0.4)" }}>
          Manage your Arriv Studio account and preferences.
        </p>
      </div>

      {/* Account */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "rgba(250,248,245,0.5)" }}>
          Account
        </h2>
        <div className="rounded-xl divide-y" style={{ background: "#1C1C1F", border: "1px solid rgba(250,248,245,0.06)", borderColor: "rgba(250,248,245,0.06)" }}>
          <div className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,90,79,0.12)" }}>
              <User className="w-4 h-4" style={{ color: "#FF5A4F" }} />
            </div>
            <div className="flex-1">
              <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>Name</p>
              <p className="text-sm font-medium" style={{ color: "#FAF8F5" }}>{clientName || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4" style={{ borderColor: "rgba(250,248,245,0.06)" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,90,79,0.12)" }}>
              <Mail className="w-4 h-4" style={{ color: "#FF5A4F" }} />
            </div>
            <div className="flex-1">
              <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>Email</p>
              <p className="text-sm font-medium" style={{ color: "#FAF8F5" }}>{clientEmail || "—"}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Subscription */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "rgba(250,248,245,0.5)" }}>
          Subscription
        </h2>
        <div className="rounded-xl p-5" style={{ background: "#1C1C1F", border: "1px solid rgba(255,90,79,0.15)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,90,79,0.12)" }}>
              <CreditCard className="w-4 h-4" style={{ color: "#FF5A4F" }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "#FAF8F5" }}>
                {entitlement?.plan_name || "Studio for Real Estate"}
              </p>
              <p className="text-xs" style={{ color: "rgba(250,248,245,0.4)" }}>
                {entitlement?.minutes_remaining ?? 0} min remaining this month
              </p>
            </div>
          </div>
          {onManageSubscription && (
            <button
              onClick={onManageSubscription}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{ background: "rgba(255,90,79,0.12)", color: "#FF746B", border: "1px solid rgba(255,90,79,0.2)" }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Manage in Arriv Studio
            </button>
          )}
        </div>
      </section>

      {/* Studio Preferences — delegates to canonical Studio */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "rgba(250,248,245,0.5)" }}>
          Studio Preferences
        </h2>
        <div className="rounded-xl p-5" style={{ background: "#1C1C1F", border: "1px solid rgba(250,248,245,0.06)" }}>
          <p className="text-sm" style={{ color: "rgba(250,248,245,0.5)" }}>
            Brand Kits, presenter defaults, voice preferences, and music libraries are managed
            directly in Arriv Studio. Use the sidebar to open Brand Kits or Libraries.
          </p>
        </div>
      </section>
    </div>
  );
}