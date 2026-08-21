import { useMemo } from "react";
import { useManifestConfig } from "./useManifestConfig";

// Label overrides hook — the Phase 7B.2 canary entry type.
//
// Returns a `t(labelKey, defaultLabel)` function that:
//   1. Fetches the canonical label_overrides manifest via getActiveManifest
//   2. If a canonical override exists for labelKey, returns it
//   3. Otherwise returns defaultLabel (existing hardcoded label)
//
// Fallback behavior: if manifest is missing/incompatible, all labels return their defaults.
// This is safe: no regression because the UI shows exactly what it showed before.

export function useLabelOverrides(runtimePath) {
  const { config, loading, error } = useManifestConfig("label_overrides", runtimePath);

  const t = useMemo(() => {
    const overrides = config?.payload?.labels || {};
    return (labelKey, defaultLabel) => {
      if (overrides[labelKey]) return overrides[labelKey];
      return defaultLabel;
    };
  }, [config]);

  return {
    t,
    loading,
    error,
    version: config?.version || null,
    fallbackUsed: config?.fallback_used || false,
    source: config?.source || "fallback",
  };
}