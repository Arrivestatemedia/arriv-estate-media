// Arriv Studio for Real Estate — canonical pricing, templates, and add-on catalog.
// These are Estate Media channel packages. Do NOT replace with generic Studio pricing.
// Additional production beyond included minutes uses canonical Studio production pricing.

export const studioPlans = [
  {
    id: "studio_creator",
    name: "Studio for Real Estate — Creator",
    price: 49,
    priceCents: 4900,
    productionMinutesPerMonth: 5,
    description: "Perfect for individual agents creating listing promos and social content.",
    features: [
      "5 Studio Production Minutes / month",
      "Real estate templates included",
      "Access to My Estate Media assets",
      "Standard presenter library",
      "1080p export",
    ],
  },
  {
    id: "studio_pro",
    name: "Studio for Real Estate — Pro",
    price: 99,
    priceCents: 9900,
    productionMinutesPerMonth: 15,
    description: "For active agents and teams who need more production capacity.",
    features: [
      "15 Studio Production Minutes / month",
      "All real estate templates",
      "My Estate Media + Upload + Generative assets",
      "Premium presenter library",
      "4K export",
      "Brand Kit support",
    ],
  },
  {
    id: "studio_brokerage",
    name: "Studio for Real Estate — Brokerage",
    price: 249,
    priceCents: 24900,
    productionMinutesPerMonth: 40,
    description: "For brokerages managing multiple agents and listings.",
    features: [
      "40 Studio Production Minutes / month",
      "All real estate templates",
      "Full asset integration",
      "Premium + custom presenter library",
      "4K export + team sharing",
      "Brand Kit + multi-agent support",
      "Priority rendering queue",
    ],
  },
];

// One-time Studio production add-ons that can be added at Estate Media checkout.
// These are NOT subscriptions — they're one-time production purchases.
export const studioCheckoutAddOns = [
  {
    id: "studio_listing_reel",
    name: "Listing Reel (Studio)",
    price: 35,
    priceCents: 3500,
    description: "Professional vertical reel from your listing media.",
    templateId: "property_tour",
    productionMinutes: 1,
  },
  {
    id: "studio_property_promo",
    name: "Property Promo (Studio)",
    price: 65,
    priceCents: 6500,
    description: "Full property promotion video with branding.",
    templateId: "property_tour",
    productionMinutes: 2,
  },
  {
    id: "studio_just_listed",
    name: "Just Listed Video (Studio)",
    price: 45,
    priceCents: 4500,
    description: "Just Listed announcement video for social + MLS.",
    templateId: "just_listed",
    productionMinutes: 1,
  },
  {
    id: "studio_social_pack",
    name: "Social Content Pack (Studio)",
    price: 75,
    priceCents: 7500,
    description: "3 social-ready videos from your shoot media.",
    templateId: "custom",
    productionMinutes: 3,
  },
  {
    id: "studio_custom",
    name: "Custom Studio Production",
    price: null,
    priceCents: null,
    description: "Custom Studio production — priced per project.",
    templateId: "custom",
    productionMinutes: null,
    isCustomQuote: true,
  },
];

// Real estate-specific Studio templates
export const studioTemplates = [
  { id: "just_listed", name: "Just Listed", category: "listing" },
  { id: "coming_soon", name: "Coming Soon", category: "listing" },
  { id: "open_house", name: "Open House", category: "listing" },
  { id: "price_improvement", name: "Price Improvement", category: "listing" },
  { id: "luxury_listing", name: "Luxury Listing", category: "listing" },
  { id: "property_tour", name: "Property Tour", category: "listing" },
  { id: "agent_introduction", name: "Agent Introduction", category: "agent" },
  { id: "agent_personal_brand", name: "Agent Personal Brand", category: "agent" },
  { id: "market_update", name: "Market Update", category: "agent" },
  { id: "buyer_education", name: "Buyer Education", category: "education" },
  { id: "seller_education", name: "Seller Education", category: "education" },
  { id: "brokerage_recruiting", name: "Brokerage Recruiting", category: "brokerage" },
  { id: "brokerage_introduction", name: "Brokerage Introduction", category: "brokerage" },
  { id: "realty_training", name: "Realty Training", category: "training" },
  { id: "agent_onboarding", name: "Agent Onboarding", category: "training" },
  { id: "listing_presentation_training", name: "Listing Presentation Training", category: "training" },
  { id: "photography_preparation_training", name: "Photography Preparation Training", category: "training" },
  { id: "custom", name: "Custom Video", category: "custom" },
];

// Real estate Studio home creation choices
export const studioCreationChoices = [
  { id: "listing_promotion", label: "Create a Listing Promotion", templateIds: ["just_listed", "coming_soon", "price_improvement", "open_house"] },
  { id: "realtor_promotion", label: "Create a Realtor Promotion", templateIds: ["agent_introduction", "agent_personal_brand", "market_update"] },
  { id: "social_content", label: "Create Social Content", templateIds: ["property_tour", "custom"] },
  { id: "property_video", label: "Create a Property Video", templateIds: ["property_tour", "luxury_listing"] },
  { id: "realty_training", label: "Create Realty Training", templateIds: ["realty_training", "agent_onboarding"] },
  { id: "client_education", label: "Create Client Education", templateIds: ["buyer_education", "seller_education"] },
  { id: "brokerage_marketing", label: "Create Brokerage Marketing", templateIds: ["brokerage_recruiting", "brokerage_introduction"] },
  { id: "custom_video", label: "Create Custom Video", templateIds: ["custom"] },
];

// Asset sources available in Studio for Real Estate
export const studioAssetSources = [
  { id: "my_estate_media", label: "My Estate Media", description: "Your delivered listing photography, video, and agent media" },
  { id: "upload", label: "Upload", description: "Upload your own files" },
  { id: "generative_media", label: "Generative Media", description: "AI-generated media assets" },
  { id: "book_new_shoot", label: "Book a New Shoot", description: "Book a new Estate Media shoot directly from Studio" },
];

// Preferred membership Studio entitlement hook types
export const studioEntitlementTypes = [
  { id: "STUDIO_DISCOUNT", label: "Studio Discount", description: "Percentage or flat discount on Studio subscription or production" },
  { id: "STUDIO_INCLUDED_MINUTES", label: "Studio Included Minutes", description: "Additional production minutes included per month" },
  { id: "STUDIO_PRIORITY", label: "Studio Priority", description: "Priority rendering queue access" },
  { id: "CUSTOM_PRESENTER_DISCOUNT", label: "Custom Presenter Discount", description: "Discount on custom presenter creation" },
];

// Suggested post-delivery creation actions
export const postDeliveryActions = [
  { id: "listing_reel", label: "Create Listing Reel", templateId: "property_tour" },
  { id: "property_promo", label: "Create Property Promo", templateId: "property_tour" },
  { id: "just_listed_video", label: "Create Just Listed Video", templateId: "just_listed" },
  { id: "open_house_promo", label: "Create Open House Promo", templateId: "open_house" },
  { id: "social_content", label: "Create Social Content", templateId: "custom" },
];

export function getStudioPlan(planId) {
  return studioPlans.find((p) => p.id === planId) || null;
}

export function getStudioCheckoutAddOn(addOnId) {
  return studioCheckoutAddOns.find((a) => a.id === addOnId) || null;
}