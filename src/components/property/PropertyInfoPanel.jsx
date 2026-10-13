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

      {/* The listing contact as the contact approved it. The brokerage is named for itself, because
          advertising rules require the brokerage to be identifiable, and the photograph is the one
          the contact supplied. */}
      <section className="rounded-2xl border border-black/5 bg-white p-6">
        <h2 className="text-lg font-serif text-[#1A1A1A] mb-3">Listing contact</h2>
        <div className="flex items-start gap-4">
          {page.agent.photo_url && (
            <img
              src={page.agent.photo_url}
              alt={page.agent.name}
              className="w-16 h-16 rounded-2xl object-cover border border-[#B8956A]/30 shrink-0"
            />
          )}
          <div>
            {page.agent.brokerage && (
              <p className="font-serif text-base text-[#1A1A1A]">{page.agent.brokerage}</p>
            )}
            <p className="text-sm font-medium text-[#1A1A1A]">{page.agent.name || "Listing agent"}</p>
            {page.agent.license_number && (
              <p className="text-xs text-[#1A1A1A]/50 mt-0.5">License {page.agent.license_number}</p>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-1.5 text-sm text-[#1A1A1A]/70">
          {page.agent.contact_email && (
            <p>
              <a href={`mailto:${page.agent.contact_email}`} className="text-[#8a6d4a] font-semibold hover:underline">
                {page.agent.contact_email}
              </a>
            </p>
          )}
          {page.agent.contact_phone && (
            <p className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-[#B8956A] shrink-0" />
              <a
                href={`tel:${String(page.agent.contact_phone).replace(/[^0-9+]/g, "")}`}
                className="text-[#8a6d4a] font-semibold hover:underline"
              >
                {page.agent.contact_phone}
              </a>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}