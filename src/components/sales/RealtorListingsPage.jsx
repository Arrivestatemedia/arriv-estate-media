import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, MapPin, Tag, ExternalLink, X, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Full-page overlay (like the in-app website browser) showing a realtor's
 * other active & recent listings. Reusable from the prospecting tab AND from
 * saved contacts (My Contacts).
 */
export default function RealtorListingsPage({ realtor, salesMemberId, locationLabel, lat, lng, onClose }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      setListings([]);
      try {
        const res = await base44.functions.invoke("findRealtorListings", {
          salesMemberId,
          name: realtor?.name,
          brokerage: realtor?.brokerage || "",
          locationLabel: locationLabel || "",
          lat,
          lng,
        });
        if (!active) return;
        const data = res.data || {};
        if (data.error) setError(data.error);
        setListings(Array.isArray(data.listings) ? data.listings : []);
      } catch (e) {
        if (active) setError(e?.message || "Failed to load listings");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [realtor?.name, realtor?.brokerage]);

  return (
    <div className="fixed inset-0 z-[100000] flex flex-col bg-white">
      {/* Title bar — matches the in-app website browser */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0 select-none"
        style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}
      >
        <Home className="w-4 h-4 flex-shrink-0" style={{ color: "#B8956A" }} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium">
            {realtor?.name || "Agent"} — Other Listings
          </p>
          {realtor?.brokerage && (
            <p className="truncate text-xs opacity-70">{realtor.brokerage}</p>
          )}
        </div>
        <button
          onClick={onClose}
          title="Close"
          className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-red-500/80 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4" style={{ backgroundColor: "#FFFBF5" }}>
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#B8956A" }} />
            <p className="text-sm" style={{ color: "rgba(26,26,26,0.6)" }}>
              Searching for this agent's listings…
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 text-center py-12">{error}</p>}

        {!loading && !error && listings.length === 0 && (
          <div className="text-center py-20">
            <Home className="w-10 h-10 mx-auto opacity-30" />
            <p className="mt-3 text-sm" style={{ color: "rgba(26,26,26,0.6)" }}>
              No other listings found for this agent.
            </p>
          </div>
        )}

        {!loading && listings.length > 0 && (
          <div className="max-w-2xl mx-auto space-y-3">
            <p className="text-xs" style={{ color: "rgba(26,26,26,0.5)" }}>
              {listings.length} listing{listings.length !== 1 ? "s" : ""} found
            </p>
            {listings.map((l, li) => (
              <div
                key={li}
                className="rounded-xl border p-4 bg-white shadow-sm"
                style={{ borderColor: "rgba(184,149,106,0.25)" }}
              >
                <p
                  className="text-sm font-medium flex items-start gap-1.5"
                  style={{ color: "#1A1A1A" }}
                >
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#B8956A" }} />
                  <span>{l.listing_address || "Address unavailable"}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {l.listing_status && (
                    <Badge variant="outline" className="text-xs">{l.listing_status}</Badge>
                  )}
                  {l.price && l.price !== "Unknown" && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Tag className="w-3 h-3" />{l.price}
                    </Badge>
                  )}
                  {l.property_type && (
                    <Badge variant="outline" className="text-xs">{l.property_type}</Badge>
                  )}
                  {typeof l.has_professional_media === "boolean" && (
                    <Badge
                      className="text-xs"
                      style={{
                        backgroundColor: l.has_professional_media ? "#dcfce7" : "#fee2e2",
                        color: l.has_professional_media ? "#15803d" : "#b91c1c",
                      }}
                    >
                      {l.has_professional_media ? "Has pro media" : "Needs media"}
                    </Badge>
                  )}
                </div>
                {l.listing_url && (
                  <a
                    href={l.listing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                    style={{ color: "#B8956A" }}
                  >
                    <ExternalLink className="w-3 h-3" /> View listing
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}