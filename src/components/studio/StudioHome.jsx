import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Film, Home, FolderPlus, Clock, TrendingUp, Image, Video,
  MapPin, Upload, Sparkles, Calendar, ArrowRight, Loader2
} from "lucide-react";
import { studioCreationChoices, studioTemplates } from "@/lib/arrivStudioConfig";

// Studio Home — the native real-estate-specific Studio landing experience.
// Shows creation choices, templates, My Listings, My Estate Media, and usage.
// When the user starts a project, it transitions to the embedded Studio editor.
export default function StudioHome({ entitlement, onStartProject }) {
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [deliveredMedia, setDeliveredMedia] = useState([]);

  useEffect(() => {
    // Load the client's bookings (for My Listings) and delivered media (for My Estate Media)
    const clientEmail = localStorage.getItem("user_email") || sessionStorage.getItem("user_email");
    if (!clientEmail) {
      setLoadingBookings(false);
      return;
    }
    base44.entities.Booking.filter({ client_email: clientEmail })
      .then((rows) => {
        setBookings(rows || []);
        const delivered = (rows || []).filter(
          (b) => b.status === "completed" || b.status === "delivered"
        );
        setDeliveredMedia(delivered);
      })
      .catch(() => {})
      .finally(() => setLoadingBookings(false));
  }, []);

  const categoryLabels = {
    listing: "Listing Promotion",
    agent: "Realtor Promotion",
    education: "Client Education",
    brokerage: "Brokerage Marketing",
    training: "Realty Training",
    custom: "Custom",
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF8F5" }}>
      {/* Studio Header Bar */}
      <div className="sticky top-0 z-10 border-b" style={{ background: "#111111", borderColor: "rgba(255,90,79,0.2)" }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)" }}>
              <Film className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold" style={{ color: "#FAF8F5" }}>Arriv Studio</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,90,79,0.15)", color: "#FF746B" }}>
              Real Estate
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs" style={{ color: "rgba(250,248,245,0.6)" }}>
            <span>{entitlement?.plan_name?.split("—")[1]?.trim() || "Studio"}</span>
            <span>·</span>
            <span>{entitlement?.minutes_remaining ?? 0} min remaining</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Create New */}
        <section>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#111111" }}>Create New</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {studioCreationChoices.map((choice) => (
              <button
                key={choice.id}
                onClick={() => onStartProject?.({ type: "creation", choiceId: choice.id, templateIds: choice.templateIds })}
                className="p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02]"
                style={{ borderColor: "rgba(255,90,79,0.15)", background: "#FFF0ED" }}
              >
                <FolderPlus className="w-5 h-5 mb-2" style={{ color: "#FF5A4F" }} />
                <p className="text-sm font-semibold" style={{ color: "#111111" }}>{choice.label}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Real Estate Templates */}
        <section>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#111111" }}>Real Estate Templates</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {studioTemplates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => onStartProject?.({ type: "template", templateId: tpl.id })}
                className="p-3 rounded-xl border text-left transition-all hover:border-[#FF5A4F]"
                style={{ borderColor: "rgba(28,28,31,0.1)", background: "white" }}
              >
                <span className="text-xs px-2 py-0.5 rounded-full mb-2 inline-block" style={{ background: "#FFF0ED", color: "#FF5A4F" }}>
                  {categoryLabels[tpl.category] || tpl.category}
                </span>
                <p className="text-sm font-medium" style={{ color: "#111111" }}>{tpl.name}</p>
              </button>
            ))}
          </div>
        </section>

        {/* My Listings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5" style={{ color: "#FF5A4F" }} />
            <h2 className="text-xl font-bold" style={{ color: "#111111" }}>My Listings</h2>
          </div>
          {loadingBookings ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(28,28,31,0.5)" }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading your listings...
            </div>
          ) : bookings.length === 0 ? (
            <div className="p-4 rounded-xl border text-sm" style={{ borderColor: "rgba(28,28,31,0.1)", color: "rgba(28,28,31,0.5)" }}>
              No listings yet. Book a shoot to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {bookings.slice(0, 6).map((b) => (
                <button
                  key={b.id}
                  onClick={() => onStartProject?.({ type: "listing", bookingId: b.id, propertyAddress: b.property_address })}
                  className="p-3 rounded-xl border text-left transition-all hover:border-[#FF5A4F] flex items-center gap-3"
                  style={{ borderColor: "rgba(28,28,31,0.1)", background: "white" }}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#FFF0ED" }}>
                    <Home className="w-5 h-5" style={{ color: "#FF5A4F" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "#111111" }}>
                      {b.property_address || "Property"}
                    </p>
                    <p className="text-xs" style={{ color: "rgba(28,28,31,0.5)" }}>
                      {b.package || "Estate Media"} · {b.status}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 shrink-0" style={{ color: "rgba(28,28,31,0.3)" }} />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* My Estate Media */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Image className="w-5 h-5" style={{ color: "#FF5A4F" }} />
            <h2 className="text-xl font-bold" style={{ color: "#111111" }}>My Estate Media</h2>
          </div>
          {deliveredMedia.length === 0 ? (
            <div className="p-4 rounded-xl border text-sm" style={{ borderColor: "rgba(28,28,31,0.1)", color: "rgba(28,28,31,0.5)" }}>
              No delivered media yet. Once your shoots are delivered, they'll appear here for use in Studio projects.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {deliveredMedia.slice(0, 8).map((b) => (
                <button
                  key={b.id}
                  onClick={() => onStartProject?.({ type: "estate_media", bookingId: b.id, assetSource: "my_estate_media" })}
                  className="p-3 rounded-xl border text-left transition-all hover:border-[#FF5A4F]"
                  style={{ borderColor: "rgba(28,28,31,0.1)", background: "white" }}
                >
                  <div className="w-full h-20 rounded-lg mb-2 flex items-center justify-center" style={{ background: "#FFF0ED" }}>
                    <Video className="w-6 h-6" style={{ color: "#FF5A4F" }} />
                  </div>
                  <p className="text-xs font-medium truncate" style={{ color: "#111111" }}>
                    {b.property_address || "Delivered Media"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Other Asset Sources */}
        <section>
          <h2 className="text-xl font-bold mb-4" style={{ color: "#111111" }}>Other Asset Sources</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => onStartProject?.({ type: "asset_source", assetSource: "upload" })}
              className="p-4 rounded-xl border-2 text-left transition-all hover:border-[#FF5A4F]"
              style={{ borderColor: "rgba(28,28,31,0.1)", background: "white" }}
            >
              <Upload className="w-5 h-5 mb-2" style={{ color: "#FF5A4F" }} />
              <p className="text-sm font-semibold" style={{ color: "#111111" }}>Upload</p>
              <p className="text-xs" style={{ color: "rgba(28,28,31,0.5)" }}>Upload your own files</p>
            </button>
            <button
              onClick={() => onStartProject?.({ type: "asset_source", assetSource: "generative_media" })}
              className="p-4 rounded-xl border-2 text-left transition-all hover:border-[#FF5A4F]"
              style={{ borderColor: "rgba(28,28,31,0.1)", background: "white" }}
            >
              <Sparkles className="w-5 h-5 mb-2" style={{ color: "#FF5A4F" }} />
              <p className="text-sm font-semibold" style={{ color: "#111111" }}>Generative Media</p>
              <p className="text-xs" style={{ color: "rgba(28,28,31,0.5)" }}>AI-generated assets</p>
            </button>
            <button
              onClick={() => { window.location.href = "/BookingPage"; }}
              className="p-4 rounded-xl border-2 text-left transition-all hover:border-[#FF5A4F]"
              style={{ borderColor: "rgba(28,28,31,0.1)", background: "white" }}
            >
              <Calendar className="w-5 h-5 mb-2" style={{ color: "#FF5A4F" }} />
              <p className="text-sm font-semibold" style={{ color: "#111111" }}>Book a New Shoot</p>
              <p className="text-xs" style={{ color: "rgba(28,28,31,0.5)" }}>Book Estate Media photography</p>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}