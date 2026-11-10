// Immediate advertising enforcement when a listing changes.
//
// A property that is sold, withdrawn, unpublished, archived or stripped of its advertising
// authority must stop advertising at the moment it changes — waiting for the next sweep would let
// a campaign keep delivering, and paying, for an unavailable property.
//
// This is deliberately cheap: it runs one query to see whether advertising exists for the listing,
// and only then loads the provider configuration to actually stop it.

import { readAdSwitches } from "./propertyAdSwitches.ts";
import { metaProvider, loadProviderAccount } from "./propertyAdProviders.ts";
import { campaignEligibility, guardListingEligibility } from "./propertyAdEngine.ts";

const ADVERTISING_STATUSES = ["READY_TO_LAUNCH", "SUBMITTED", "ACTIVE"];

function rows(result: any): any[] {
  if (Array.isArray(result)) return result;
  return result?.items || [];
}

export async function guardListingAdvertising(client: any, listing: any, input: { actor: string }) {
  if (!listing?.listing_id) return { affected: [], paused: [], needs_stop: [], skipped: true };

  const campaigns = rows(await client.asServiceRole.entities.PropertyAdCampaign.filter({
    listing_id: listing.listing_id,
    status: { $in: ADVERTISING_STATUSES },
  })).filter((campaign) => campaign.certification_mode !== true);
  if (!campaigns.length) return { affected: [], paused: [], needs_stop: [], skipped: true };

  const eligibility = campaignEligibility(listing, new Date());
  if (eligibility.eligible) return { affected: [], paused: [], needs_stop: [], skipped: true };

  const switches = await readAdSwitches(client);
  const account = await loadProviderAccount(client, 'meta');
  const result = await guardListingEligibility(client, {
    listing,
    reason: eligibility.blockers[0],
    actor: input.actor,
    provider: metaProvider,
    account,
    switches,
  });

  if (result.needs_stop.length) {
    const adminEmail = String((globalThis as any)?.process?.env?.ADMIN_EMAIL || '');
    if (adminEmail.includes('@')) {
      try {
        await client.asServiceRole.integrations.Core.SendEmail({
          to: adminEmail,
          subject: 'Advertising is still running on an ineligible property',
          body: `Advertising for listing ${listing.listing_id} could not be stopped automatically.\n\nReason: ${eligibility.blockers[0]}\nCampaigns needing a manual stop at the platform: ${result.needs_stop.join(', ')}\n\nStop these campaigns in the advertising platform now.`,
          from_name: 'Arriv Estate Media',
        });
      } catch {
        // The flag on each campaign is the durable record; the email is only a nudge.
      }
    }
  }

  return result;
}