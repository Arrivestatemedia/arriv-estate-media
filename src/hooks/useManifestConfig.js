import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Frontend manifest config cache (session-level, 5-minute TTL).
// Key: entry_type
const manifestConfigCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Hook to fetch and cache canonical manifest configuration for a given entry type.
// Falls back to null (runtime uses existing defaults) on any error.
export function useManifestConfig(entryType, runtimePath) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConfig = useCallback(async () => {
    // Check session cache
    const cached = manifestConfigCache.get(entryType);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      setConfig(cached.value);
      setLoading(false);
      return;
    }

    try {
      const res = await base44.functions.invoke("getActiveManifest", {
        entry_type: entryType,
        runtime_path: runtimePath || `useManifestConfig:${entryType}`,
      });
      const data = res?.data || res;
      manifestConfigCache.set(entryType, { value: data, cachedAt: Date.now() });
      setConfig(data);
      setError(null);
    } catch (e) {
      // Fallback — runtime uses existing defaults
      const fallback = {
        manifest_id: `fallback:${entryType}`,
        entry_type: entryType,
        version: null,
        payload: {},
        scope: "fallback",
        source: "fallback",
        fallback_used: true,
        fallback_reason: "accessor_error",
        compatible: false,
      };
      setConfig(fallback);
      setError(e?.message || "Failed to load manifest config");
    } finally {
      setLoading(false);
    }
  }, [entryType, runtimePath]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const invalidate = useCallback(() => {
    manifestConfigCache.delete(entryType);
    setLoading(true);
    fetchConfig();
  }, [entryType, fetchConfig]);

  return { config, loading, error, invalidate };
}

// Exported for manual cache invalidation (e.g., on admin actions)
export function invalidateManifestConfigCache(entryType) {
  if (entryType) {
    manifestConfigCache.delete(entryType);
  } else {
    manifestConfigCache.clear();
  }
}