// ============================================================================
// PAYOUT_V2 — Marketplace Media Partner Gig payout waterfall
//
// ISOLATED from B2B. Applies ONLY to future eligible Media Partner
// marketplace Gigs created on or after PAYOUT_V2_EFFECTIVE_AT.
//
// This module does NOT modify any shared compensation engine. It provides
// marketplace-specific sales rep resolution (with Brad fallback) and version
// constants for audit logging.
//
// Formula (already implemented in mediaCompensationEngine.ts):
//   salesCommission    = eligibleSubtotal × 0.15
//   postSalesAmount     = eligibleSubtotal - salesCommission
//   mediaSpecialistPayout = postSalesAmount × 0.40
//   arrivRevenue        = eligibleSubtotal - salesCommission - mediaSpecialistPayout
// ============================================================================

// Deployment/effective timestamp. Jobs created before this use existing stored
// financial snapshots and are NEVER recalculated.
export const PAYOUT_V2_EFFECTIVE_AT = "2026-09-29T00:00:00.000Z";

// Calculation version tag stored on financial snapshots for audit reconstruction.
export const PAYOUT_V2_VERSION = "PAYOUT_V2";

// Brad fallback — canonical SalesTeamMember ID for Bradley Burke.
// Identified from the existing SalesTeamMember entity (single match).
export const BRAD_SALES_MEMBER_ID = "699d451307489496757cee13";
export const BRAD_SALES_MEMBER_NAME = "Bradley Burke";
export const BRAD_SALES_MEMBER_EMAIL = "BradCBurke@arrivestatemedia.com";

export interface ResolvedSalesRep {
  sales_member_id: string;
  sales_member_name: string;
  sales_member_email: string;
  is_brad_fallback: boolean;
}

// Resolve the sales rep for a MARKETPLACE gig, with Brad fallback.
//
// Priority:
//   1. assignedSalesRepId (explicitly assigned rep on the booking)
//   2. originatingSalesRep (from converted ClientSignupInvite)
//   3. BRAD (fallback when no other rep is found)
//
// MARKETPLACE ONLY. Do NOT use for B2B orders, contracts, or organizations.
export async function resolveMarketplaceSalesRep(
  base44: any,
  options: { assignedSalesRepId?: string; clientEmail?: string }
): Promise<ResolvedSalesRep> {
  const { assignedSalesRepId, clientEmail } = options;

  // 1. Explicitly assigned sales rep
  if (assignedSalesRepId) {
    try {
      const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: assignedSalesRepId });
      if (reps && reps[0]) {
        return {
          sales_member_id: reps[0].id,
          sales_member_name: reps[0].full_name || "",
          sales_member_email: reps[0].email || "",
          is_brad_fallback: false,
        };
      }
    } catch (_e) { /* fall through */ }
  }

  // 2. Originating sales rep from converted ClientSignupInvite
  if (clientEmail) {
    try {
      const invites = await base44.asServiceRole.entities.ClientSignupInvite.filter({
        client_email: clientEmail,
        status: "converted",
      });
      if (invites && invites[0] && invites[0].sales_member_id) {
        const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: invites[0].sales_member_id });
        if (reps && reps[0]) {
          return {
            sales_member_id: reps[0].id,
            sales_member_name: reps[0].full_name || "",
            sales_member_email: reps[0].email || "",
            is_brad_fallback: false,
          };
        }
      }
    } catch (_e) { /* fall through */ }
  }

  // 3. Brad fallback — no other eligible sales rep found
  return {
    sales_member_id: BRAD_SALES_MEMBER_ID,
    sales_member_name: BRAD_SALES_MEMBER_NAME,
    sales_member_email: BRAD_SALES_MEMBER_EMAIL,
    is_brad_fallback: true,
  };
}