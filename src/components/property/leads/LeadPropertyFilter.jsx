import React from "react";
import { Home } from "lucide-react";
import { listingAddress } from "@/lib/propertyLeads";

// One chip per property page, so a customer with several pages can read one inbox at a time.
export default function LeadPropertyFilter({ listings, value, onChange }) {
  if (!listings?.length) return null;

  const chip = (active) =>
    `inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
      active
        ? "bg-[#B8956A] text-[#1A1A1A] border-[#B8956A]"
        : "bg-white text-[#1A1A1A]/70 border-[#B8956A]/25 hover:border-[#B8956A]/60"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={chip(value === "all")} onClick={() => onChange("all")}>
        All properties
      </button>
      {listings.map((listing) => (
        <button
          key={listing.listing_id}
          type="button"
          className={chip(value === listing.listing_id)}
          onClick={() => onChange(listing.listing_id)}
        >
          <Home className="w-3.5 h-3.5" />
          <span className="max-w-[220px] truncate">{listingAddress(listing) || listing.public_slug}</span>
          <span className={value === listing.listing_id ? "text-[#1A1A1A]/60" : "text-[#1A1A1A]/40"}>
            {listing.leads_total}
          </span>
        </button>
      ))}
    </div>
  );
}