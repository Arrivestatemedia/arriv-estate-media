import React from "react";
import { money } from "@/lib/propertyVisibility";

// Preview of exactly what will be published: approved details and the approved media order.
export default function PropertyPagePreview({ listing, mediaUrls }) {
  const media = (listing?.selected_media || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const cover = media.find((m) => m.drive_file_id === listing?.cover_file_id) || media.find((m) => m.kind === "photo");
  const facts = [
    listing?.bedrooms != null ? `${listing.bedrooms} bed` : null,
    listing?.bathrooms != null ? `${listing.bathrooms} bath` : null,
    listing?.square_footage != null ? `${listing.square_footage.toLocaleString("en-US")} sq ft` : null,
    listing?.property_type || null,
  ].filter(Boolean);

  return (
    <section className="rounded-2xl border border-[#B8956A]/25 bg-white p-6">
      <h2 className="text-lg font-medium text-[#1A1A1A] mb-1">Preview</h2>
      <p className="text-sm text-[#1A1A1A]/50 mb-5">This is what your property page will show once published.</p>

      <div className="rounded-xl overflow-hidden border border-black/5">
        <div className="bg-[#1A1A1A] p-6">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#B8956A] mb-2">Arriv Estate Media</p>
          <h3 className="text-2xl font-serif text-[#FFFBF5]">{listing?.seo_title || listing?.property_address || "Property"}</h3>
          <p className="text-sm text-[#FFFBF5]/60 mt-1">
            {[listing?.city, listing?.state, listing?.zip].filter(Boolean).join(", ")}
          </p>
          {listing?.listing_price != null && <p className="text-xl text-[#B8956A] mt-3">{money(listing.listing_price)}</p>}
          {facts.length > 0 && <p className="text-sm text-[#FFFBF5]/70 mt-2">{facts.join(" · ")}</p>}
        </div>

        {cover && (
          <div className="aspect-video bg-[#FFFBF5] flex items-center justify-center text-xs text-[#1A1A1A]/40">
            {mediaUrls?.[cover.drive_file_id] ? (
              <img src={mediaUrls[cover.drive_file_id]} alt={cover.alt_text || cover.name} className="w-full h-full object-cover" />
            ) : (
              <span>Cover photo: {cover.name}</span>
            )}
          </div>
        )}

        <div className="p-6">
          <p className="text-sm text-[#1A1A1A]/75 whitespace-pre-line">{listing?.property_description || "No description approved yet."}</p>
          {(listing?.amenities || []).length > 0 && (
            <p className="text-sm text-[#1A1A1A]/60 mt-3">Amenities: {listing.amenities.join(", ")}</p>
          )}
          <p className="text-xs text-[#1A1A1A]/45 mt-4">
            {media.filter((m) => m.kind === "photo").length} photographs
            {listing?.include_video ? ` · ${media.filter((m) => m.kind === "video").length} video` : ""}
          </p>
          <p className="text-xs text-[#1A1A1A]/45 mt-1">
            Listed by {listing?.agent_name || "not set"}{listing?.brokerage_name ? `, ${listing.brokerage_name}` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}