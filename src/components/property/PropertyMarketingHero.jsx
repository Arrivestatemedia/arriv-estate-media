import React from "react";
import { motion } from "framer-motion";
import { Home, MapPin, Share2, Check, BedDouble, Bath, Ruler } from "lucide-react";
import { money } from "@/lib/propertyVisibility";

// Dark marketing hero, built in the same visual language as the client delivery gallery:
// gold lockup, serif display title, media-first framing.
export default function PropertyMarketingHero({ page, copied, onShare }) {
  const facts = [
    { Icon: BedDouble, label: page.bedrooms != null ? `${page.bedrooms} bed` : null },
    { Icon: Bath, label: page.bathrooms != null ? `${page.bathrooms} bath` : null },
    { Icon: Ruler, label: page.square_footage != null ? `${Number(page.square_footage).toLocaleString("en-US")} sq ft` : null },
  ].filter((f) => f.label);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex items-center gap-2 mb-5">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#B8956A] to-[#8a6d4a] flex items-center justify-center shadow-lg shadow-[#B8956A]/30">
            <Home className="w-5 h-5 text-[#0a0b0f]" />
          </div>
          <div className="absolute inset-0 rounded-xl bg-[#B8956A]/40 blur-md -z-10" />
        </div>
        <div>
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#B8956A] block leading-none">Arriv Estate Media</span>
          <span className="text-[10px] tracking-[0.15em] uppercase text-white/30 block leading-none mt-1">Property Marketing</span>
        </div>
      </div>

      <h1 className="text-3xl sm:text-5xl font-serif text-white mb-3 leading-tight tracking-tight">
        {page.seo_title || page.property_address}
      </h1>

      <p className="flex items-center gap-2 text-sm text-white/50 mb-5">
        <MapPin className="w-4 h-4 text-[#B8956A] shrink-0" />
        {[page.property_address, page.city, page.state, page.zip].filter(Boolean).join(", ")}
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        {page.listing_price != null && (
          <span className="text-2xl sm:text-3xl text-white font-medium">{money(page.listing_price)}</span>
        )}
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
          page.publicly_available
            ? "bg-[#B8956A]/15 border-[#B8956A]/30 text-[#B8956A]"
            : "bg-white/5 border-white/15 text-white/60"
        }`}>
          {page.status_label}
        </span>
        <button
          onClick={onShare}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm text-white/50 hover:text-white border border-white/10 hover:border-[#B8956A]/40 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-[#B8956A]" /> : <Share2 className="w-4 h-4" />}
          {copied ? "Link copied" : "Share"}
        </button>
      </div>

      {(facts.length > 0 || page.property_type) && (
        <div className="flex flex-wrap items-center gap-2">
          {facts.map(({ Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/70">
              <Icon className="w-3.5 h-3.5 text-[#B8956A]" />
              {label}
            </span>
          ))}
          {page.property_type && (
            <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/70 capitalize">
              {page.property_type.replace(/_/g, " ")}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}