import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Loads the active tenant's branding (logo + brand colors) and applies the
// colors as CSS variables so the whole app re-themes to the company's brand.
// Also exposes the tenant branding via context so the header can render the
// company logo with a "Powered by Arriv One" attribution beneath it.

const TenantBrandContext = createContext({ tenant: null, reload: async () => {} });
export const useTenantBrand = () => useContext(TenantBrandContext);

function getSalesMemberId() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id") || "";
}

export default function TenantThemeProvider({ children }) {
  const [tenant, setTenant] = useState(null);

  const reload = useCallback(async () => {
    try {
      // "View as" preview: a platform admin viewing a specific tenant's branding.
      const viewAsId = typeof window !== "undefined" ? sessionStorage.getItem("view_as_tenant_id") : "";
      const res = await base44.functions.invoke("manageTenantSettings", {
        action: "get",
        sales_member_id: getSalesMemberId(),
        ...(viewAsId ? { override_tenant_id: viewAsId } : {}),
      });
      if (res?.data) setTenant(res.data);
    } catch {
      // Not authenticated or no tenant configured â fall back to defaults.
    }
  }, []);

  useEffect(() => {
    reload();
    // Reload branding whenever view-as preview mode is entered or exited.
    const handler = () => reload();
    window.addEventListener("view-as-changed", handler);
    return () => window.removeEventListener("view-as-changed", handler);
  }, [reload]);

  useEffect(() => {
    const root = document.documentElement;
    if (tenant?.primary_color) root.style.setProperty("--accent-color", tenant.primary_color);
    if (tenant?.accent_color) root.style.setProperty("--accent-hover", tenant.accent_color);
  }, [tenant]);

  return (
    <TenantBrandContext.Provider value={{ tenant, reload }}>
      {children}
    </TenantBrandContext.Provider>
  );
}