// Who may appear in the public property directory, defined once.
//
// The directory search endpoint and the server-rendered directory page both build their query
// here, so the two can never disagree about what a visitor is allowed to see. Only PUBLISHED,
// non-certification listings whose status is active or pending AND whose status was confirmed
// inside the documented window are eligible: sold, withdrawn, expired and stale-unconfirmed
// listings are structurally absent, never filtered out afterwards.

import {
  AVAILABLE_LISTING_STATUSES,
  STATUS_CONFIRMATION_WINDOW_DAYS,
  certificationScope,
} from "./propertyVisibility.ts";

// The directory is a front page, not a listing export: one page of results is what it shows.
export const DIRECTORY_MAX_RESULTS = 24;

export function directoryQuery(opts: { testMode: boolean }): Record<string, any> {
  const cutoff = new Date(Date.now() - STATUS_CONFIRMATION_WINDOW_DAYS * 86400000).toISOString();
  return {
    publication_state: "PUBLISHED",
    listing_status: { $in: [...AVAILABLE_LISTING_STATUSES] },
    certification_mode: certificationScope(opts.testMode),
    last_status_confirmed_at: { $gte: cutoff },
  };
}

// ---------------------------------------------------------------------------------------------
// The search filters — ONE definition, used by the directory search endpoint and by the
// server-rendered directory page, so a visitor searching on the property host and a client calling
// the search endpoint can never be shown a different set of listings.

export const DIRECTORY_FILTER_NAMES = [
  "q",
  "min_price",
  "max_price",
  "min_bedrooms",
  "min_bathrooms",
  "property_type",
  "status",
] as const;

export type DirectoryFilters = {
  q: string;
  min_price: string;
  max_price: string;
  min_bedrooms: string;
  min_bathrooms: string;
  property_type: string;
  status: string;
};

// Reads what the visitor actually typed, from a query string or a request body. A value that is
// absent is an empty string: no filter, never a filter on nothing.
export function directoryFilterValues(read: (name: string) => any): DirectoryFilters {
  const text = (name: string) => String(read(name) ?? "").trim();
  return {
    q: text("q"),
    min_price: text("min_price"),
    max_price: text("max_price"),
    min_bedrooms: text("min_bedrooms") || text("bedrooms"),
    min_bathrooms: text("min_bathrooms") || text("bathrooms"),
    property_type: text("property_type"),
    status: text("status"),
  };
}

export function hasDirectoryFilters(filters: DirectoryFilters): boolean {
  return DIRECTORY_FILTER_NAMES.some((name) => !!filters[name]);
}

// Eligibility stays in directoryQuery; this only narrows it further. A filter can therefore never
// widen what is visible — an unpublished, sold or stale-unconfirmed listing is already absent by
// the time any of this is applied.
export function applyDirectoryFilters(query: Record<string, any>, filters: DirectoryFilters): void {
  if (filters.q) {
    // Location search across the fields a visitor actually types.
    const rx = filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { city: { $regex: rx, $options: "i" } },
      { state: { $regex: rx, $options: "i" } },
      { zip: { $regex: rx, $options: "i" } },
      { property_address: { $regex: rx, $options: "i" } },
    ];
  }

  const num = (value: string) => (value === undefined || value === null || value === "" ? null : Number(value));

  const minPrice = num(filters.min_price);
  const maxPrice = num(filters.max_price);
  if (minPrice != null || maxPrice != null) {
    query.listing_price = {};
    if (minPrice != null) query.listing_price.$gte = minPrice;
    if (maxPrice != null) query.listing_price.$lte = maxPrice;
  }

  const minBeds = num(filters.min_bedrooms);
  if (minBeds != null) query.bedrooms = { $gte: minBeds };
  const minBaths = num(filters.min_bathrooms);
  if (minBaths != null) query.bathrooms = { $gte: minBaths };

  if (filters.property_type) query.property_type = filters.property_type;
  // An unrecognised status is ignored rather than trusted, so a query string cannot ask for a
  // listing state the directory never offers.
  if (filters.status && AVAILABLE_LISTING_STATUSES.includes(filters.status)) query.listing_status = filters.status;
}