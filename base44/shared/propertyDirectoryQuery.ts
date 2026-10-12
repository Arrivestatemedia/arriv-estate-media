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