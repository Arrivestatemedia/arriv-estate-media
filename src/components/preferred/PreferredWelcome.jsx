import React, { useEffect, useState } from "react";
import { Crown } from "lucide-react";

const SEEN_KEY = "arriv_preferred_welcome_at";

/**
 * One-time premium welcome transition after Preferred access is confirmed.
 * The flag is stored per browser so it never replays on ordinary visits.
 */
export default function PreferredWelcome({ customer }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let seen = null;
    try {
      seen = window.localStorage.getItem(SEEN_KEY);
    } catch {
      seen = null;
    }
    if (seen) return;
    setVisible(true);
    const timer = setTimeout(() => dismiss(), 5200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    setLeaving(true);
    try {
      window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      /* storage unavailable: the transition simply shows once per visit */
    }
    setTimeout(() => setVisible(false), 420);
  }

  if (!visible) return null;
  const firstName = String(customer?.first_name || customer?.full_name || "").split(" ")[0];

  return (
    <div
      role="dialog"
      aria-label="Welcome to Arriv Preferred"
      className={`fixed inset-0 z-[80] flex items-center justify-center px-6 transition-opacity duration-400 ${leaving ? "opacity-0" : "opacity-100"}`}
      style={{ background: "radial-gradient(900px 600px at 50% 0%, #1b2022 0%, #0b0e0f 72%)" }}
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-full border border-[#c8a87c]/45 bg-[#c8a87c]/10">
          <Crown className="h-6 w-6 text-[#d9bd95]" />
        </div>
        <p className="mb-3 text-xs uppercase tracking-[0.42em] text-[#c8a87c]">Arriv Preferred</p>
        <h2 className="preferred-gold-text font-serif text-4xl leading-tight">
          Welcome{firstName ? `, ${firstName}` : ""}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-[#f6f1e8]/65">
          Your portal is now white-glove. Tell the concierge what you need and it will take you
          there, pull your properties, galleries and billing, and open the right secure flow.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="preferred-focus mt-8 rounded-full border border-[#c8a87c]/45 px-7 py-2.5 text-sm font-medium text-[#f6f1e8] transition-colors hover:bg-[#c8a87c]/15"
        >
          Enter your portal
        </button>
      </div>
    </div>
  );
}