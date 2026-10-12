import React from "react";
import { Phone } from "lucide-react";

// The reading half of the marketing page: off-white cards on the dark frame, so the approved
// property facts, amenities and listing attribution stay easy to read.
export default function PropertyInfoPanel({ page }) {
  const amenities = page.amenities || [];

  return (
    <div className="space-y-6">
      {page.property_description && (
        <section className="rounded-2xl border border-black/5 bg-white p-6">
          <h2 className="text-lg font-serif text-[#1A1A1A] mb-3">About this property</h2>
          <p className="text-[#1A1A1A]/75 leading-relaxed whitespace-pre-line">{page.property_description}</p>
        </section>
      )}

      {amenities.length > 0 && (
        <section className="rounded-2xl border border-black/5 bg-white p-6">
          <h2 className="text-lg font-serif text-[#1A1A1A] mb-3">Amenities</h2>
          <ul className="flex flex-wrap gap-2">
            {amenities.map((a) => (
              <li key={a} className="px-3 py-1 rounded-full bg-[#FFFBF5] border border-[#B8956A]/20 text-sm text-[#1A1A1A]/70">
                {a}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-black/5 bg-white p-6">
        <h2 className="text-lg font-serif text-[#1A1A1A] mb-3">Listing contact</h2>
        <p className="text-sm text-[#1A1A1A]/75">
          {page.agent.name || "Listing agent"}
          {page.agent.brokerage ? ` · ${page.agent.brokerage}` : ""}
        </p>
        {page.agent.license_number && (
          <p className="text-xs text-[#1A1A1A]/50 mt-1">License {page.agent.license_number}</p>
        )}
        {page.agent.contact_phone && (
          <p className="flex items-center gap-2 text-sm text-[#1A1A1A]/60 mt-2">
            <Phone className="w-3.5 h-3.5 text-[#B8956A]" />
            {page.agent.contact_phone}
          </p>
        )}
      </section>
    </div>
  );
}