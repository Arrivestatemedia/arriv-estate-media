import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Checks the current user's Arriv Studio entitlement.
// Used by navigation components to conditionally show the Studio tab
// and by the Studio workspace to gate access.
// Caches result in localStorage so nav components render without a flash.
export function useStudioEntitlement() {
  const [entitlement, setEntitlement] = useState(() => {
    try {
      const cached = localStorage.getItem("studio_entitlement");
      return cached ? JSON.parse(cached) : { active: false, loading: true };
    } catch {
      return { active: false, loading: true };
    }
  });
  const [loading, setLoading] = useState(!entitlement?.active);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getStudioEntitlement", {});
      const data = res?.data || res;
      const result = {
        active: !!data?.active,
        plan_id: data?.plan_id || null,
        plan_name: data?.plan_name || null,
        monthly_minutes: data?.monthly_minutes || 0,
        minutes_remaining: data?.minutes_remaining ?? 0,
        minutes_used: data?.minutes_used ?? 0,
        organization_id: data?.organization_id || null,
        entitlement_source: data?.entitlement_source || null,
        entitlement_overrides: data?.entitlement_overrides || null,
        subscription_id: data?.subscription_id || null,
      };
      setEntitlement({ ...result, loading: false });
      localStorage.setItem("studio_entitlement", JSON.stringify(result));
    } catch {
      setEntitlement({ active: false, loading: false });
      localStorage.setItem("studio_entitlement", JSON.stringify({ active: false }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { entitlement, loading, refresh };
}