// ============================================================================
// MEDIA CAPABILITIES — Defines provider skill capabilities and maps
// packages/add-ons to the capabilities required for fulfillment.
// ONE MEDIA JOB IS FULFILLED BY ONE MEDIA PARTNER.
// A provider who cannot perform EVERY required service must not accept.
// ============================================================================

export const MEDIA_CAPABILITIES = [
  "photography",
  "videography",
  "drone",
  "tour_3d",
  "twilight_capture",
] as const;

export type MediaCapability = (typeof MEDIA_CAPABILITIES)[number];

/** Capabilities required for each package's fulfillment. */
export const PACKAGE_REQUIRED_CAPABILITIES: Record<string, string[]> = {
  mls_walkthrough: ["videography"],
  photo_essentials: ["photography"],
  photo_cinematic: ["photography", "videography"],
  premium_bundle: ["photography", "videography", "tour_3d"],
};

/** Capabilities required for each add-on's fulfillment. */
export const ADDON_REQUIRED_CAPABILITIES: Record<string, string[]> = {
  drone: ["drone"],
  "3d_tour": ["tour_3d"],
  twilight: ["twilight_capture"],
  rush_delivery: [],
  vertical_reel: [],
  ai_staging: [],
};

/** Check if a provider's verified capabilities include ALL required capabilities. */
export function hasAllCapabilities(
  verifiedCapabilities: string[],
  requiredCapabilities: string[]
): boolean {
  return requiredCapabilities.every((cap) => verifiedCapabilities.includes(cap));
}

/** Get the combined required capabilities for a package + selected add-ons. */
export function getRequiredCapabilities(
  packageId: string,
  addOnIds: string[] = []
): string[] {
  const pkgCaps = PACKAGE_REQUIRED_CAPABILITIES[packageId] || [];
  const addonCaps = addOnIds.flatMap((id) => ADDON_REQUIRED_CAPABILITIES[id] || []);
  return [...new Set([...pkgCaps, ...addonCaps])];
}

/** Human-readable labels for each capability. */
export const CAPABILITY_LABELS: Record<string, string> = {
  photography: "Photography",
  videography: "Videography / Cinematic Walkthrough",
  drone: "Drone Photography",
  tour_3d: "3D Tour Capture",
  twilight_capture: "Twilight Photography",
};