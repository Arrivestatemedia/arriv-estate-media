import React from "react";
import { Menu, X, Phone } from "lucide-react";

/**
 * MobileDialerShell — mobile only.
 *
 * Takes over the whole screen so the dialer feels like the phone app itself:
 * a compact bar with the app menu (hamburger) on the left, the screen title in
 * the middle, and a close control that returns to the rest of the page.
 */
export default function MobileDialerShell({ children, onExit }) {
  const openAppNav = () => window.dispatchEvent(new CustomEvent("arriv:open-app-nav"));

  return (
    <div
      className="fixed inset-0 z-[60] bg-white flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        className="flex items-center justify-between px-2 h-14 border-b shrink-0"
        style={{ borderColor: "rgba(184,149,106,0.25)" }}
      >
        <button
          onClick={openAppNav}
          aria-label="Open navigation"
          className="p-2 rounded-lg"
          style={{ color: "#1A1A1A" }}
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2 font-semibold text-sm" style={{ color: "#1A1A1A" }}>
          <Phone className="w-4 h-4" style={{ color: "#B8956A" }} />
          Dialer
        </div>
        <button
          onClick={onExit}
          aria-label="Close dialer"
          className="p-2 rounded-lg"
          style={{ color: "rgba(26,26,26,0.6)" }}
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}