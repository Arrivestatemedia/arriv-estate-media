import React from "react";
import { Link } from "react-router-dom";
import { BarChart3, Building2, CalendarClock, Crown, Images, Play, TrendingUp } from "lucide-react";

function money(cents) {
  return `$${Math.round(Number(cents || 0) / 100).toLocaleString("en-US")}`;
}

function shortDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PreferredWorkspaceRail({ stats, latestMedia, plan, periodEnd }) {
  const media = latestMedia || null;

  return (
    <aside className="space-y-4">
      <div className="preferred-glass preferred-gold-ring p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c8a87c]/15">
            <Crown className="h-4 w-4 text-[#d9bd95]" />
          </span>
          <div>
            <p className="text-[13px] text-[#f6f1e8]">Arriv Preferred</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#c8a87c]">White-Glove Service</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#f6f1e8]/50">
          {plan ? String(plan).replace(/_/g, " ") : "Membership"}
          {periodEnd ? ` · active through ${shortDate(periodEnd)}` : ""}
        </p>
      </div>

      <div className="preferred-glass p-4">
        <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-[#f6f1e8]/40">At a glance</p>
        <ul className="space-y-3">
          <li className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[12px] text-[#f6f1e8]/60">
              <TrendingUp className="h-3.5 w-3.5 text-[#c8a87c]" /> Your Savings
            </span>
            <span className="text-right">
              <span className="block text-[15px] text-[#f6f1e8]">{money(stats?.savings_cents)}</span>
              <span className="text-[10px] text-[#f6f1e8]/35">This Year</span>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[12px] text-[#f6f1e8]/60">
              <Building2 className="h-3.5 w-3.5 text-[#c8a87c]" /> Active Listings
            </span>
            <span className="text-[15px] text-[#f6f1e8]">{Number(stats?.active_listings || 0)}</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[12px] text-[#f6f1e8]/60">
              <CalendarClock className="h-3.5 w-3.5 text-[#c8a87c]" /> Upcoming Shoots
            </span>
            <span className="text-[15px] text-[#f6f1e8]">{Number(stats?.upcoming_shoots || 0)}</span>
          </li>
        </ul>
      </div>

      <div className="preferred-glass overflow-hidden">
        <div className="relative h-32 w-full bg-[radial-gradient(300px_160px_at_50%_0%,#1f2628_0%,#0b0f10_80%)]">
          {media?.image_url ? (
            <img src={media.image_url} alt={media.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Images className="h-7 w-7 text-[#c8a87c]/35" />
            </div>
          )}
          {media && (
            <Link
              to="/ClientBookings"
              aria-label="Open the delivered gallery"
              className="preferred-focus absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/10"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#c8a87c]/50 bg-black/45">
                <Play className="ml-0.5 h-4 w-4 text-[#f0dcb9]" />
              </span>
            </Link>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#c8a87c]">
            {media ? "Latest Media Ready" : "No delivery yet"}
          </p>
          <p className="mt-1 truncate text-[13px] text-[#f6f1e8]/85">
            {media ? media.title : "Your delivered media will appear here."}
          </p>
          {media?.delivered_at && (
            <p className="mt-0.5 text-[10px] text-[#f6f1e8]/35">{shortDate(media.delivered_at)}</p>
          )}
        </div>
      </div>

      <Link
        to="/VisibilityDashboard"
        className="preferred-focus flex items-center justify-between rounded-xl border border-[#c8a87c]/20 px-4 py-2.5 text-[12px] text-[#f6f1e8]/70 transition-colors hover:border-[#c8a87c]/45 hover:text-[#f6f1e8]"
      >
        View performance
        <BarChart3 className="h-3.5 w-3.5 text-[#c8a87c]" />
      </Link>
    </aside>
  );
}