import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CreditCard, Loader2, AlertCircle } from "lucide-react";

/**
 * B2B Booking Experience Adapter
 * 
 * Injected into the existing BookingPage when the user is a B2B organization member.
 * Shows credit/capacity requirement and projected balance instead of retail price.
 * 
 * Does NOT replace the booking form — it adapts the commercial display.
 */
export default function B2BBookingAdapter({ userEmail, packageName, propertySqft, addOns }) {
  const [entitlement, setEntitlement] = useState(null);
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEntitlement();
  }, [userEmail]);

  useEffect(() => {
    if (entitlement && packageName && propertySqft) {
      calculateRequirement();
    }
  }, [entitlement, packageName, propertySqft, addOns]);

  const loadEntitlement = async () => {
    try {
      const res = await base44.functions.invoke("resolveB2BEntitlement", { email: userEmail });
      setEntitlement(res?.data || res);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const calculateRequirement = async () => {
    try {
      const res = await base44.functions.invoke("resolveB2BBookingEntitlementRequirement", {
        email: userEmail,
        package_name: packageName,
        property_sqft: propertySqft,
        addon_ids: addOns || [],
      });
      setRequirement(res?.data || res);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[#B8956A]" /></div>;
  }

  // Only show for B2B users
  if (entitlement?.commercial_domain !== 'B2B') return null;

  // Account hold
  if (entitlement?.account_hold) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-600" />
        <p className="text-sm text-red-700">Your account is on hold. Please contact your sales representative.</p>
      </div>
    );
  }

  if (!requirement || !requirement.success) return null;

  return (
    <div className="bg-[#B8956A]/5 border border-[#B8956A]/20 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-[#B8956A]" />
        <h3 className="font-medium text-[#1A1A1A]">B2B Entitlement</h3>
      </div>

      {entitlement.funding_mode === 'media_credit' && requirement.funding_mode === 'media_credit' && (
        <div className="space-y-2 text-sm">
          {requirement.addon_breakdown && requirement.addon_breakdown.length > 0 && (
            <div className="space-y-1 pb-2 border-b border-[#B8956A]/10">
              <div className="flex justify-between">
                <span className="text-[#1A1A1A]/60">Package ({packageName})</span>
                <span className="font-medium text-[#1A1A1A]">{((requirement.base_credit_requirement || 0) / 100).toFixed(2)}</span>
              </div>
              {requirement.addon_breakdown
                .filter(a => a.calculation_method !== 'EXCLUDED' && a.calculation_method !== 'NOT_ELIGIBLE')
                .map((a, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-[#1A1A1A]/60 capitalize">
                    {a.addon_id.replace(/_/g, ' ')}
                  </span>
                  <span className="font-medium text-[#1A1A1A]">+{a.credit_cost_display?.toFixed(2) || '0.00'}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[#1A1A1A]/60">Total Required</span>
            <span className="font-medium text-[#1A1A1A]">{requirement.total_credit_requirement_display?.toFixed(2) || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#1A1A1A]/60">Available Credits</span>
            <span className="font-medium text-[#1A1A1A]">{((entitlement.credits?.credits_available_units || 0) / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#1A1A1A]/60">After Booking</span>
            <span className="font-medium text-[#1A1A1A]">
              {Math.max(0, ((entitlement.credits?.credits_available_units || 0) / 100) - (requirement.total_credit_requirement_display || 0)).toFixed(2)}
            </span>
          </div>
          {requirement.credit_shortfall > 0 && requirement.cash_obligation_if_applicable > 0 && (
            <p className="text-amber-600 text-xs">
              Insufficient credits: {(requirement.credit_shortfall / 100).toFixed(2)} credits require ${requirement.cash_obligation_if_applicable.toFixed(2)} cash.
            </p>
          )}
          {requirement.requires_custom_quote && (
            <p className="text-amber-600 text-xs">Custom quote required for this property size.</p>
          )}
        </div>
      )}

      {entitlement.funding_mode === 'reserved_capacity' && requirement.funding_mode === 'reserved_capacity' && (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#1A1A1A]/60">Available Shoots</span>
            <span className="font-medium text-[#1A1A1A]">{entitlement.capacity?.shoots_available || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#1A1A1A]/60">Required Shoots</span>
            <span className="font-medium text-[#1A1A1A]">{requirement.reserved_shoot_requirement || 1}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#1A1A1A]/60">Projected Remaining</span>
            <span className="font-medium text-[#1A1A1A]">{requirement.projected_capacity_remaining || 0}</span>
          </div>
          {requirement.large_property_surcharge_obligation > 0 && (
            <p className="text-amber-600 text-xs">Large-property surcharge: ${requirement.large_property_surcharge_obligation}</p>
          )}
          {requirement.requires_custom_quote && (
            <p className="text-amber-600 text-xs">Custom quote required for this property size.</p>
          )}
        </div>
      )}
    </div>
  );
}