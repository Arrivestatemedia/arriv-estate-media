import React from "react";
import { Link } from "react-router-dom";
import { MapPin, BedDouble, Bath, Ruler } from "lucide-react";
import { money } from "@/lib/propertyVisibility";

export default function PropertyCard({ property }) {
  return (
    <Link to={`/properties/${property.slug}`} className="group block rounded-2xl overflow-hidden border border-black/5 bg-white hover:border-[#B8956A]/40 transition-colors">
      {property.cover_url ? (
        <img src={property.cover_url} alt={property.property_address} loading="lazy" className="w-full aspect-[4/3] object-cover group-hover:opacity-95" />
      ) : (
        <div className="w-full aspect-[4/3] bg-[#FFFBF5]" />
      )}
      <div className="p-4">
        <p className="text-lg text-[#1A1A1A] font-medium">{property.listing_price != null ? money(property.listing_price) : "Price on request"}</p>
        <p className="flex items-center gap-1.5 text-xs text-[#1A1A1A]/55 mt-1">
          <MapPin className="w-3.5 h-3.5 text-[#B8956A]" />
          {[property.city, property.state].filter(Boolean).join(", ")}
        </p>
        <p className="text-sm text-[#1A1A1A]/70 mt-1 truncate">{property.property_address}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#1A1A1A]/60 mt-3">
          {property.bedrooms != null && <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" />{property.bedrooms}</span>}
          {property.bathrooms != null && <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{property.bathrooms}</span>}
          {property.square_footage != null && <span className="flex items-center gap-1"><Ruler className="w-3.5 h-3.5" />{Number(property.square_footage).toLocaleString("en-US")}</span>}
          <span className="ml-auto px-2 py-0.5 rounded-full bg-[#B8956A]/15 text-[#B8956A] font-semibold capitalize">{property.listing_status}</span>
        </div>
      </div>
    </Link>
  );
}