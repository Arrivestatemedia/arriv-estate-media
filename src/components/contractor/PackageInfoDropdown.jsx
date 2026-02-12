import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const packages = [
  {
    id: "mls_walkthrough",
    name: "MLS Walkthrough",
    features: [
      "2-3 minute unbranded MLS-ready walkthrough (MLS & GAMLS compliant)",
      "Bonus vertical social clip (Instagram/Reels ready)",
    ],
  },
  {
    id: "photo_essentials",
    name: "Photo Essentials",
    features: [
      "50-150 edited photos (interior + exterior)",
      "True-to-life color + straight verticals",
      "1 vertical teaser (9:16, 30-45 sec)",
    ],
  },
  {
    id: "photo_cinematic",
    name: "Photo + Cinematic Walkthrough",
    features: [
      "Everything in Photo Essentials",
      "2 - 3 Minute walkthrough video (MLS-friendly export)",
      "2 vertical reels",
    ],
  },
  {
    id: "premium_bundle",
    name: "Premium Media Bundle",
    features: [
      "Everything in Photo + Cinematic Walkthrough",
      "90 Tour",
      "Twilight exterior edits (up to 5 photos)",
      "AI Staging (if needed)",
    ],
  },
];

const standardAddOns = {
  id: "standard_addons",
  name: "Standard Add-ons",
  items: [
    {
      name: "Drone Aerial",
      description: "Professional aerial photography and videography, showcase property from unique perspectives",
    },
    {
      name: "Twilight Shoot",
      description: "Golden hour exterior photography, dramatic lighting for enhanced curb appeal",
    },
    {
      name: "3D Matterport Tour",
      description: "Interactive 3D virtual tour, dollhouse view and floor plan",
    },
    {
      name: "Floor Plan",
      description: "Professional 2D floor plan, accurate measurements and room labels",
    },
  ],
};

export default function PackageInfoDropdown() {
  const [expandedPackage, setExpandedPackage] = useState(null);

  return (
    <Card className="border-2 border-[#B8956A]/20 bg-white">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-[#1A1A1A]">
          Package Information
        </CardTitle>
        <p className="text-sm text-[#1A1A1A]/60">What's included in each package</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A1A] mb-2">Packages</h3>
          <div className="space-y-2">
            {packages.map((pkg) => (
              <div key={pkg.id} className="border border-[#B8956A]/20 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedPackage(expandedPackage === pkg.id ? null : pkg.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#B8956A]/5 transition-colors"
                >
                  <span className="font-medium text-[#1A1A1A]">{pkg.name}</span>
                  {expandedPackage === pkg.id ? (
                    <ChevronUp className="w-4 h-4 text-[#B8956A]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#B8956A]" />
                  )}
                </button>

                <AnimatePresence>
                  {expandedPackage === pkg.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-3 space-y-2 bg-[#FFFBF5]">
                        {pkg.features.map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-[#1A1A1A]/70">
                            <Check className="w-4 h-4 text-[#B8956A] mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[#1A1A1A] mb-2">Add-ons</h3>
          <div className="space-y-2">
            <div className="border border-[#B8956A]/20 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedPackage(expandedPackage === standardAddOns.id ? null : standardAddOns.id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#B8956A]/5 transition-colors"
              >
                <span className="font-medium text-[#1A1A1A]">{standardAddOns.name}</span>
                {expandedPackage === standardAddOns.id ? (
                  <ChevronUp className="w-4 h-4 text-[#B8956A]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#B8956A]" />
                )}
              </button>

              <AnimatePresence>
                {expandedPackage === standardAddOns.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 space-y-3 bg-[#FFFBF5]">
                      {standardAddOns.items.map((item, idx) => (
                        <div key={idx} className="text-[#1A1A1A]/70">
                          <div className="font-medium text-sm text-[#1A1A1A] mb-1">{item.name}</div>
                          <div className="text-sm pl-2">{item.description}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}