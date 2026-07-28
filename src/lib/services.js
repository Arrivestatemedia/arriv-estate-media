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

export function computeTotal(pkgId, addOnIds) {
  const pkg = packages.find((p) => p.id === pkgId);
  const pkgPrice = pkg ? pkg.price : 0;
  const addOnPrice = (addOnIds || [])
    .reduce((sum, id) => sum + (addOns.find((a) => a.id === id)?.price || 0), 0);
  return pkgPrice + addOnPrice;
}