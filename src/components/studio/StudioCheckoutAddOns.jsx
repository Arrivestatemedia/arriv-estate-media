import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Film, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { studioCheckoutAddOns } from "@/lib/arrivStudioConfig";

// Optional Arriv Studio add-ons shown in the checkout flow.
// These are one-time Studio production purchases, not subscriptions.
export default function StudioCheckoutAddOns({ selectedAddOns, onAdd, onRemove }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-lg border-2 border-[#B8956A]/20 overflow-hidden mb-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#B8956A]/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-[#B8956A]" />
          <span className="text-lg font-semibold text-[#1A1A1A]">
            Add Arriv Studio
          </span>
          <span className="text-xs text-[#1A1A1A]/50 ml-2">
            (optional video production)
          </span>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-3">
              <p className="text-sm text-[#1A1A1A]/60 mb-2">
                Turn your shoot media into professional videos. One-time production — no subscription required.
              </p>
              {studioCheckoutAddOns.map((addon) => {
                const isSelected = selectedAddOns.find((a) => a.id === addon.id);
                return (
                  <div
                    key={addon.id}
                    className={`flex items-center justify-between gap-4 p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? "border-[#B8956A] bg-[#B8956A]/5"
                        : "border-[#1A1A1A]/10 hover:border-[#B8956A]/30"
                    }`}
                  >
                    <div className="flex-1">
                      <span className="text-sm font-medium text-[#1A1A1A]">
                        {addon.name}
                      </span>
                      <p className="text-xs text-[#1A1A1A]/50 mt-0.5">
                        {addon.description}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-[#1A1A1A] shrink-0">
                      {addon.isCustomQuote ? "Custom Quote" : `$${addon.price}`}
                    </span>
                    {isSelected ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRemove(addon.id)}
                        className="border-red-300 text-red-600 hover:bg-red-50 shrink-0"
                      >
                        Remove
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => onAdd(addon)}
                        className="bg-[#B8956A] hover:bg-[#A68559] text-white shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
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
  );
}