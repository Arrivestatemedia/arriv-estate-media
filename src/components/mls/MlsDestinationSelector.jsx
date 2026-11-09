import React from "react";
import { Input } from "@/components/ui/input";
import { Zap, Users, CheckCircle2 } from "lucide-react";

/**
 * MlsDestinationSelector
 * Shown ONLY when more than one supported MLS covers the property.
 *
 * It lists nothing but the eligible systems, preselects them per the stated policy, and lets the
 * customer change the set before submitting. Each checked MLS becomes its own independent
 * publishing destination. With a single eligible MLS this component never renders — the customer is
 * not asked to confirm a membership when only one system can possibly apply.
 */
export default function MlsDestinationSelector({
  destinations = [],
  selected = [],
  onToggle,
  policy,
  numbers = {},
  onNumberChange,
}) {
  if (!destinations || destinations.length < 2) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/50 mb-2">
        MLS systems covering this property ({destinations.length})
      </p>
      {policy && (
        <p className="text-[11px] text-[#1A1A1A]/60 bg-[#FFFBF5] border border-[#B8956A]/25 rounded-lg px-2.5 py-2 mb-2 leading-relaxed">
          {policy}
        </p>
      )}
      <div className="space-y-2">
        {destinations.map((d) => {
          const checked = selected.includes(d.provider_id);
          return (
            <div
              key={d.provider_id}
              className={`rounded-xl border p-3 transition-colors ${
                checked ? "border-[#B8956A] bg-[#B8956A]/5" : "border-[#B8956A]/20 bg-white"
              }`}
            >
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle && onToggle(d.provider_id)}
                  className="mt-0.5 w-4 h-4 accent-[#B8956A]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-[#1A1A1A]">
                    {d.short_label}
                    {d.publishing_mode === "automatic" ? (
                      <Zap className="w-3.5 h-3.5 text-[#B8956A]" />
                    ) : (
                      <Users className="w-3.5 h-3.5 text-[#B8956A]" />
                    )}
                  </span>
                  <span className="block text-xs text-[#1A1A1A]/60 mt-0.5">{d.coverage_label}</span>
                  <span className="block text-[11px] text-[#1A1A1A]/45 mt-0.5">
                    {d.publishing_mode === "automatic"
                      ? "Publishes automatically the moment you submit."
                      : "Arriv's MLS team publishes this one for you."}
                  </span>
                </span>
              </label>
              {checked && d.requires_listing_number && (
                <div className="mt-2 pl-6">
                  <Input
                    value={numbers[d.provider_id] || ""}
                    onChange={(e) => onNumberChange && onNumberChange(d.provider_id, e.target.value)}
                    placeholder={`${d.short_label} listing number`}
                  />
                  <p className="text-[11px] text-[#1A1A1A]/40 mt-1">
                    {d.number_hint || "Your listing must already exist in this MLS."}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selected.length > 1 && (
        <p className="text-[11px] text-[#1A1A1A]/45 mt-2 flex items-start gap-1.5">
          <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-[#B8956A]" />
          Each MLS is submitted separately. One failing never affects the others.
        </p>
      )}
    </div>
  );
}