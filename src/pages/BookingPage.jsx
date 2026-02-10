import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BookingForm from "../components/booking/BookingForm";

const packages = [
  {
    id: "mls_walkthrough",
    name: "MLS Walkthrough",
    tag: "Most Popular",
    price: 175,
    features: [
      "2-3 minute unbranded MLS-ready walkthrough (MLS & GAMLS compliant)",
      "Bonus vertical social clip (Instagram/Reels ready)",
    ],
  },
  {
    id: "photo_essentials",
    name: "Photo Essentials",
    price: 350,
    features: [
      "50-150 edited photos (interior + exterior)",
      "True-to-life color + straight verticals",
      "1 vertical teaser (9:16, 30-45 sec)",
    ],
  },
  {
    id: "photo_cinematic",
    name: "Photo + Cinematic Walkthrough",
    price: 550,
    features: [
      "Everything in Photo Essentials",
      "2 - 3 Minute walkthrough video (MLS-friendly export)",
      "2 vertical reels",
    ],
  },
  {
    id: "premium_bundle",
    name: "Premium Media Bundle",
    price: 750,
    features: [
      "Everything in Photo + Cinematic Walkthrough",
      "90 Tour",
      "Twilight exterior edits (up to 5 photos)",
      "AI Staging (if needed)",
    ],
  },
];

const addOns = [
  { id: "drone", name: "Drone add-on (photos + short clips)", price: 175 },
  { id: "3d_tour", name: "3D tour", price: 175 },
  { id: "twilight", name: "Twilight exterior edits (up to 5 photos)", price: 150 },
  { id: "rush_delivery", name: "Next-day rush delivery (when available)", price: 150 },
  { id: "vertical_reel", name: "Additional vertical reel", price: 50 },
  { id: "ai_staging", name: "AI Staging", price: 150 },
];

function PackageCard({ pkg, isExpanded, onToggle, onSelect, isSelected }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-[#1A1A1A]/10 last:border-b-0"
    >
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#B8956A]/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-[#1A1A1A]">{pkg.name}</span>
          {pkg.tag && (
            <span className="px-2 py-1 bg-[#B8956A] text-white text-xs rounded-full">
              {pkg.tag}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold text-[#B8956A]">${pkg.price}</span>
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-3">
              {pkg.features.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[#1A1A1A]/70">
                  <span className="text-sm mt-0.5">•</span>
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
              <Button
                onClick={() => onSelect(pkg)}
                className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white mt-4"
                disabled={isSelected}
              >
                {isSelected ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Selected
                  </>
                ) : (
                  "Select Package"
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function BookingPage() {
  const [expandedPackage, setExpandedPackage] = useState(null);
  const [expandedAddOns, setExpandedAddOns] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [cartAddOns, setCartAddOns] = useState([]);

  const createBookingMutation = useMutation({
    mutationFn: (data) => base44.entities.Booking.create(data),
    onSuccess: () => {
      setShowBookingForm(false);
      setSelectedPackage(null);
      alert("Booking request submitted! We'll contact you shortly to confirm.");
    },
  });

  const handleSelectPackage = (pkg) => {
    setSelectedPackage(pkg);
  };

  const handleAddToCart = (addon) => {
    if (!cartAddOns.find(a => a.id === addon.id)) {
      setCartAddOns([...cartAddOns, addon]);
    }
  };

  const handleRemoveFromCart = (addonId) => {
    setCartAddOns(cartAddOns.filter(a => a.id !== addonId));
  };

  const totalPrice = (selectedPackage?.price || 0) + cartAddOns.reduce((sum, a) => sum + a.price, 0);

  const handleSubmitBooking = (bookingData) => {
    createBookingMutation.mutate(bookingData);
  };

  if (showBookingForm) {
    return (
      <BookingForm
        selectedPackage={selectedPackage}
        cartAddOns={cartAddOns}
        addOns={addOns}
        onSubmit={handleSubmitBooking}
        onCancel={() => {
          setShowBookingForm(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] mb-4">
            TRANSPARENT PRICING FOR PROFESSIONAL REAL ESTATE MEDIA
          </h1>
          <p className="text-lg text-[#1A1A1A]/70 italic mb-8">
            Built specifically for listings that want media that just works.
          </p>

          <div className="space-y-4 text-left max-w-2xl mx-auto mb-8">
            <p className="text-[#1A1A1A]/80">
              We specialize in clean, unbranded MLS walkthrough videos that can be published
              immediately without compliance issues. Photos, 3D tours, and add-ons are layered in
              when they help the listing.
            </p>
            <p className="text-[#1A1A1A]/80">
              All shoots include editing, color correction, and MLS-ready delivery. Custom packages
              available.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg border-2 border-[#B8956A]/20 overflow-hidden mb-8">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              isExpanded={expandedPackage === pkg.id}
              onToggle={() => setExpandedPackage(expandedPackage === pkg.id ? null : pkg.id)}
              onSelect={handleSelectPackage}
              isSelected={selectedPackage?.id === pkg.id}
            />
          ))}
        </div>

        <div className="bg-white rounded-lg shadow-lg border-2 border-[#B8956A]/20 overflow-hidden mb-8">
          <button
            onClick={() => setExpandedAddOns(!expandedAddOns)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#B8956A]/5 transition-colors"
          >
            <span className="text-lg font-semibold text-[#1A1A1A]">
              Optional Add-Ons (can be added to any package)
            </span>
            {expandedAddOns ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>

          <AnimatePresence>
            {expandedAddOns && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-6 space-y-2">
                  {addOns.map((addon) => {
                    const isInCart = cartAddOns.find(a => a.id === addon.id);
                    return (
                      <div key={addon.id} className="flex items-center justify-between py-2 gap-4">
                        <span className="text-sm text-[#1A1A1A]/70 flex-1">{addon.name}</span>
                        <span className="text-sm font-semibold text-[#1A1A1A]">${addon.price}</span>
                        {isInCart ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemoveFromCart(addon.id)}
                            className="border-red-300 text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleAddToCart(addon)}
                            className="bg-[#B8956A] hover:bg-[#A68559] text-white"
                          >
                            Add
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-white rounded-lg shadow-lg border-2 border-[#B8956A]/20 p-6 space-y-4">
          <h3 className="font-semibold text-[#1A1A1A]">Payment</h3>
          <ul className="space-y-2 text-sm text-[#1A1A1A]/70">
            <li>• Standard invoicing upon delivery</li>
            <li>
              • <strong>Pay-at-closing available upon request</strong> (settled as a small
              percentage of the final sale price)
            </li>
            <li>
              • <strong>Availability is limited and scheduled on a first-come basis.</strong>
            </li>
          </ul>
          <p className="text-xs text-[#1A1A1A]/50 italic pt-4 border-t border-[#1A1A1A]/10">
            Notes: MLS platforms compress media differently, all deliverables are exported for MLS
            compatibility. Custom quotes available for luxury, large acreage, or complex shoots.
          </p>
        </div>

        {(selectedPackage || cartAddOns.length > 0) && (
          <div className="bg-white rounded-lg shadow-lg border-2 border-[#B8956A] p-6 mb-8">
            <h3 className="font-semibold text-[#1A1A1A] mb-4">Your Cart</h3>
            {selectedPackage && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-[#1A1A1A]">{selectedPackage.name}</span>
                <span className="font-semibold text-[#B8956A]">${selectedPackage.price}</span>
              </div>
            )}
            {cartAddOns.map((addon) => (
              <div key={addon.id} className="flex justify-between items-center mb-2">
                <span className="text-[#1A1A1A]/70 text-sm">+ {addon.name}</span>
                <span className="font-semibold text-[#1A1A1A] text-sm">${addon.price}</span>
              </div>
            ))}
            <div className="border-t border-[#1A1A1A]/10 mt-4 pt-4 flex justify-between items-center">
              <span className="font-semibold text-[#1A1A1A]">Total</span>
              <span className="text-2xl font-bold text-[#B8956A]">${totalPrice}</span>
            </div>
          </div>
        )}

        <div className="text-center mt-12">
          <Button
            onClick={() => setShowBookingForm(true)}
            size="lg"
            className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white px-12 py-6 text-lg"
            disabled={!selectedPackage}
          >
            {selectedPackage ? "Take me to my cart" : "Select a package to continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}