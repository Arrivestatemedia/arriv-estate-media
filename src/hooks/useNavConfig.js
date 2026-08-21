import { useMemo } from "react";
import { useManifestConfig } from "./useManifestConfig";

// Nav config hook — resolves canonical nav_config manifest.
// Returns overrides that the Layout can apply to nav items:
//   - label overrides (by page ID)
//   - ordering
//   - visibility
//
// Estate Media-native sections are preserved unless explicitly hidden by canonical config.
// Fallback: empty overrides — Layout uses existing hardcoded nav items.
export function useNavConfig(runtimePath) {
  const { config, loading, error } = useManifestConfig("nav_config", runtimePath);

  const overrides = useMemo(() => {
    const sections = config?.payload?.sections || [];
    const byPageId = {};
    for (const section of sections) {
      if (section.page_id) {
        byPageId[section.page_id] = section;
      }
    }
    return {
      byPageId,
      raw: config?.payload || { sections: [] },
      version: config?.version || null,
      fallbackUsed: config?.fallback_used || false,
    };
  }, [config]);

  // Helper: get overridden label for a nav item
  const getNavLabel = (pageId, defaultLabel) => {
    const section = overrides.byPageId[pageId];
    if (section && section.label) return section.label;
    return defaultLabel;
  };

  // Helper: check if a nav item should be visible
  const getNavVisibility = (pageId, defaultVisible = true) => {
    const section = overrides.byPageId[pageId];
    if (section && section.visible === false) return false;
    return defaultVisible;
  };

  return {
    ...overrides,
    getNavLabel,
    getNavVisibility,
    loading,
    error,
  };
}