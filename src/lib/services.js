// Shared service catalog used by the client BookingPage and the sales "Convert to Job" flow.
export const packages = [
  {
    id: "mls_walkthrough",
    name: "MLS Walkthrough",
    tag: "Most Popular",
    price: 100,
    features: [
      "2-3 minute unbranded MLS-ready walkthrough (MLS & GAMLS compliant)",
      "Bonus vertical social clip (Instagram/Reels ready)",
    ],
  },
  {
    id: "photo_essentials",
    name: "Photo Essentials",
    price: 275,
    features: [
      "50-150 edited photos (interior + exterior)",
      "True-to-life color + straight verticals",
      "1 vertical teaser (9:16, 30-45 sec)",
    ],
  },
  {
    id: "photo_cinematic",
    name: "Photo + Cinematic Walkthrough",
    price: 475,
    features: [
      "Everything in Photo Essentials",
      "2 - 3 Minute walkthrough video (MLS-friendly export)",
      "2 vertical reels",
    ],
  },
  {
    id: "premium_bundle",
    name: "Premium Media Bundle",
    price: 675,
    features: [
      "Everything in Photo + Cinematic Walkthrough",
      "3D Tour",
      "Twilight exterior edits (up to 5 photos)",
      "AI Staging (if needed)",
    ],
  },
];

export const addOns = [
  { id: "drone", name: "Drone add-on (photos + short clips)", price: 125 },
  { id: "3d_tour", name: "3D Tour", price: 125 },
  { id: "twilight", name: "Twilight exterior edits (up to 5 photos)", price: 125 },
  { id: "rush_delivery", name: "Next-day rush delivery (when available)", price: 100 },
  { id: "vertical_reel", name: "Additional vertical reel", price: 40 },
  { id: "ai_staging", name: "AI Staging", price: 125 },
];

export const packageNames = {
  mls_walkthrough: "MLS Walkthrough",
  photo_essentials: "Photo Essentials",
  photo_cinematic: "Photo + Cinematic Walkthrough",
  premium_bundle: "Premium Media Bundle",
};

export const addOnNames = {
  drone: "Drone add-on",
  "3d_tour": "3D Tour",
  twilight: "Twilight exterior edits",
  rush_delivery: "Next-day rush delivery",
  vertical_reel: "Additional vertical reel",
  ai_staging: "AI Staging",
};

// --- Sqft-based tier pricing (mirrors the server-side mediaPricingEngine) ---

export const tierPrices = [
  { tier: "TIER_1", label: "0–2,500 sq ft", min: 0, prices: { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 } },
  { tier: "TIER_2", label: "2,501–3,500 sq ft", min: 2501, prices: { mls_walkthrough: 125, photo_essentials: 325, photo_cinematic: 525, premium_bundle: 750 } },
  { tier: "TIER_3", label: "3,501–5,000 sq ft", min: 3501, prices: { mls_walkthrough: 150, photo_essentials: 375, photo_cinematic: 575, premium_bundle: 825 } },
  { tier: "TIER_4", label: "5,001–7,500 sq ft", min: 5001, prices: { mls_walkthrough: 200, photo_essentials: 450, photo_cinematic: 650, premium_bundle: 950 } },
  { tier: "TIER_5", label: "7,501–10,000 sq ft", min: 7501, prices: { mls_walkthrough: 275, photo_essentials: 575, photo_cinematic: 775, premium_bundle: 1100 } },
];

export function determinePricingTier(sqft) {
  if (!sqft || sqft <= 0) return null;
  if (sqft > 10000) return "CUSTOM";
  for (const t of tierPrices) {
    if (sqft >= t.min) return t.tier;
  }
  return null;
}

export function getTierPriceMap(tier) {
  if (!tier || tier === "CUSTOM") return null;
  return tierPrices.find((t) => t.tier === tier)?.prices || null;
}

export function getTierLabel(tier) {
  if (!tier) return null;
  if (tier === "CUSTOM") return "10,001+ sq ft (Custom Quote)";
  return tierPrices.find((t) => t.tier === tier)?.label || null;
}

export function getPackagePriceForTier(pkgId, tier) {
  if (!tier || tier === "CUSTOM") return null;
  const priceMap = getTierPriceMap(tier);
  return priceMap ? priceMap[pkgId] : null;
}

export function computeTotal(pkgId, addOnIds) {
  const pkg = packages.find((p) => p.id === pkgId);
  const pkgPrice = pkg ? pkg.price : 0;
  const addOnPrice = (addOnIds || [])
    .reduce((sum, id) => sum + (addOns.find((a) => a.id === id)?.price || 0), 0);
  return pkgPrice + addOnPrice;
}

export function computeTotalForTier(pkgId, addOnIds, tier) {
  const pkgPrice = getPackagePriceForTier(pkgId, tier) ?? (packages.find((p) => p.id === pkgId)?.price || 0);
  const addOnPrice = (addOnIds || [])
    .reduce((sum, id) => sum + (addOns.find((a) => a.id === id)?.price || 0), 0);
  return pkgPrice + addOnPrice;
}