import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Film, ChevronDown, ChevronUp, Check, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { studioCheckoutAddOns, studioPlans } from "@/lib/arrivStudioConfig";

// Optional Arriv Studio section in the Estate Media checkout flow.
// PATH A — BUNDLE: Customer can add a Studio subscription (Creator/Pro/Brokerage)
//   to their Estate Media purchase. Estate Media handles the transaction.
//   After verified payment, the Studio entitlement activates and the tab appears.
// Also offers one-time Studio production add-ons (no subscription required).
export default function StudioCheckoutAddOns({ selectedAddOns, onAdd, onRemove, selectedBundle, onSelectBundle, onRemoveBundle }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg shadow-lg border-2 overflow-hidden mb-8" style={{ background: "white", borderColor: "rgba(255,90,79,0.2)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between transition-colors hover:bg-[#FFF0ED]"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)" }}>
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-semibold" style={{ color: "#111111" }}>
            Add Arriv Studio
          </span>
          <span className="text-xs ml-2" style={{ color: "rgba(17,17,17,0.5)" }}>
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
            <div className="px-6 pb-6 space-y-5">
              {/* PATH A — Subscription Bundle */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4" style={{ color: "#FF5A4F" }} />
                  <p className="text-sm font-semibold" style={{ color: "#111111" }}>
                    Bundle with Studio — Monthly Subscription
                  </p>
                </div>
                <p className="text-xs mb-3" style={{ color: "rgba(17,17,17,0.5)" }}>
                  Add a Studio plan to your purchase. After payment, the Studio tab appears in your app.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {studioPlans.map((plan) => {
                    const isSelected = selectedBundle?.id === plan.id;
                    return (
                      <button
                        key={plan.id}
                        onClick={() => isSelected ? onRemoveBundle?.() : onSelectBundle?.(plan)}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          isSelected ? "border-[#FF5A4F] bg-[#FFF0ED]" : "border-[#111111]/10 hover:border-[#FF5A4F]/40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold" style={{ color: "#111111" }}>
                            {plan.name.split("—")[1]?.trim() || plan.name}
                          </span>
                          {isSelected && <Check className="w-4 h-4" style={{ color: "#FF5A4F" }} />}
                        </div>
                        <p className="text-lg font-bold" style={{ color: "#111111" }}>
                          ${plan.price}<span className="text-xs font-normal" style={{ color: "rgba(17,17,17,0.5)" }}>/mo</span>
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(17,17,17,0.5)" }}>
                          {plan.productionMinutesPerMonth} min/month
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* One-time production add-ons */}
              <div className="pt-3 border-t" style={{ borderColor: "rgba(17,17,17,0.08)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "#111111" }}>
                  One-Time Studio Production
                </p>
                <p className="text-xs mb-3" style={{ color: "rgba(17,17,17,0.5)" }}>
                  Turn your shoot media into professional videos. No subscription required.
                </p>
                {studioCheckoutAddOns.map((addon) => {
                  const isSelected = selectedAddOns.find((a) => a.id === addon.id);
                  return (
                    <div
                      key={addon.id}
                      className={`flex items-center justify-between gap-4 p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? "border-[#FF5A4F] bg-[#FFF0ED]"
                          : "border-[#111111]/10 hover:border-[#FF5A4F]/30"
                      }`}
                    >
                      <div className="flex-1">
                        <span className="text-sm font-medium" style={{ color: "#111111" }}>
                          {addon.name}
                        </span>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(17,17,17,0.5)" }}>
                          {addon.description}
                        </p>
                      </div>
                      <span className="text-sm font-semibold shrink-0" style={{ color: "#111111" }}>
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
                          style={{ background: "linear-gradient(135deg, #FF5A4F, #FF806F)", color: "white" }}
                          className="shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Add
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}