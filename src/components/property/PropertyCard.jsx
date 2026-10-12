import React from "react";
import { Link } from "react-router-dom";
import { MapPin, BedDouble, Bath, Ruler } from "lucide-react";
import { money } from "@/lib/propertyVisibility";

// Directory tile, in the delivery gallery's visual language: dark frame, gold accent,
// media first.
export default function PropertyCard({ property }) {
  return (
    <Link
      to={`/properties/${property.slug}`}
      className="group block rounded-2xl overflow-hidden ring-1 ring-white/10 hover:ring-[#B8956A]/40 bg-[#0a0b0f] transition-all duration-300"
    >
      <div className="relative overflow-hidden bg-white/5">
        {property.cover_url ? (
          <img
            src={property.cover_url}
            alt={property.property_address}
            loading="lazy"
            className="w-full aspect-[4/3] object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full aspect-[4/3] bg-gradient-to-br from-[#1a1d24] to-[#0a0b0f]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-70 group-hover:opacity-90 transition-opacity duration-300" />
        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-black/50 backdrop-blur-md text-[#B8956A] border border-[#B8956A]/30">
          {property.listing_status}
        </span>
      </div>

      <div className="p-4">
        <p className="text-lg text-white font-medium">
          {property.listing_price != null ? money(property.listing_price) : "Price on request"}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-white/50 mt-1">
          <MapPin className="w-3.5 h-3.5 text-[#B8956A]" />
          {[property.city, property.state].filter(Boolean).join(", ")}
        </p>
        <p className="text-sm text-white/70 mt-1 truncate">{property.property_address}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/50 mt-3">
          {property.bedrooms != null && (
            <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5 text-[#B8956A]" />{property.bedrooms}</span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5 text-[#B8956A]" />{property.bathrooms}</span>
          )}
          {property.square_footage != null && (
            <span className="flex items-center gap-1"><Ruler className="w-3.5 h-3.5 text-[#B8956A]" />{Number(property.square_footage).toLocaleString("en-US")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}