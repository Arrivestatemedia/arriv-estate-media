import React from "react";
import { useLabelOverrides } from "@/hooks/useLabelOverrides";

// ManifestLabel — the Phase 7B.2 label_overrides canary component.
//
// Renders a label that can be overridden by canonical Arriv One ProductManifest config.
// If the manifest is missing or fallback is active, renders the default label (no regression).
// Telemetry is recorded by the backend accessor (getActiveManifest) on every resolution.
//
// Usage: <ManifestLabel labelKey="dashboard_title" defaultLabel="Dashboard" />
export default function ManifestLabel({ labelKey, defaultLabel, runtimePath, as: Component = "span", ...props }) {
  const { t, loading, version, fallbackUsed } = useLabelOverrides(
    runtimePath || `ManifestLabel:${labelKey}`
  );

  const label = t(labelKey, defaultLabel);

  return (
    <Component
      data-manifest-label-key={labelKey}
      data-manifest-version={version || "fallback"}
      data-manifest-fallback={fallbackUsed ? "true" : "false"}
      {...props}
    >
      {label}
    </Component>
  );
}