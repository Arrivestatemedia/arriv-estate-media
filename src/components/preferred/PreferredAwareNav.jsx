import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import NewJobsBadge from "@/components/layout/NewJobsBadge";
import PreferredNavLink from "./PreferredNavLink";
import { usePreferred } from "./PreferredProvider";

/**
 * The signed-in navigation links.
 *
 * A Preferred member's only experience is the Preferred workspace, which carries its own
 * gold navigation, so the generic portal links are not rendered for them at all.
 */
export default function PreferredAwareNav({ items, currentPageName, mobile = false, onNavigate }) {
  const { preferred } = usePreferred();
  if (preferred) return null;

  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const active = currentPageName === item.page;
        return (
          <Link
            key={item.page}
            to={createPageUrl(item.page)}
            onClick={onNavigate}
            className={mobile
              ? `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${active ? "bg-[#B8956A] text-[#1A1A1A]" : "text-[#FFFBF5]/70 hover:bg-[#FFFBF5]/10"}`
              : `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all shrink-0 ${active ? "bg-[#B8956A] text-[#1A1A1A]" : "text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"}`}
          >
            <Icon className="w-4 h-4" />
            {item.label}
            {item.showBadge && <NewJobsBadge />}
          </Link>
        );
      })}
      <PreferredNavLink mobile={mobile} onClick={onNavigate} />
    </>
  );
}