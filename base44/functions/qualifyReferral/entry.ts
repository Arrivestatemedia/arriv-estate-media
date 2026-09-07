import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { determineReferralReward } from "../../shared/referralRewards.ts";

// Qualify a referral and create the referral credit ledger entry.
// Automatically determines $20 vs $40 based on whether the referrer is an
// active Preferred member at the time of qualification.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { referral_id, qualifying_event, related_order_id, actor_id, actor_name } = body;

    if (!referral_id) {
      return Response.json({ error: "referral_id is required" }, { status: 400 });
    }

    const referral = await base44.asServiceRole.entities.Referral.get(referral_id);
    if (!referral) {
      return Response.json({ error: "Referral not found" }, { status: 404 });
    }
    if (referral.qualification_status === "QUALIFIED") {
      return Response.json({ error: "Referral already qualified" }, { status: 400 });
    }

    // Check if the referrer is an active Preferred member
    let isPreferredReferrer = false;
    try {
      const memberships = await base44.asServiceRole.entities.PreferredMembership.filter({
        client_id: referral.referrer_customer_id,
      });
      isPreferredReferrer = (memberships || []).some(m => m.status === "active");
      if (!isPreferredReferrer && referral.referrer_customer_id) {
        // Also try looking up by email if we have it from the contact
        const contacts = await base44.asServiceRole.entities.Contact.filter({
          id: referral.referrer_customer_id,
        });
        const contact = contacts?.[0];
        if (contact?.email) {
          const membershipsByEmail = await base44.asServiceRole.entities.PreferredMembership.filter({
            client_email: contact.email,
          });
          isPreferredReferrer = (membershipsByEmail || []).some(m => m.status === "active");
        }
      }
    } catch (e) {
      console.error("Preferred membership check error:", e.message);
    }

    // Determine reward
    const reward = determineReferralReward(isPreferredReferrer);
    const now = new Date().toISOString();

    // Update the referral record
    await base44.asServiceRole.entities.Referral.update(referral_id, {
      qualification_status: "QUALIFIED",
      qualifying_event: qualifying_event || "Manually qualified",
      qualifying_event_date: now,
      credit_earned: true,
      credit_amount: reward.amount,
      is_preferred_referrer: reward.is_preferred_referrer,
      reward_type: reward.reward_type,
      related_order_id: related_order_id || "",
      qualified_at: now,
    });

    // Calculate current balance for the ledger
    const existingEntries = await base44.asServiceRole.entities.ReferralCreditLedger.filter({
      customer_id: referral.referrer_customer_id,
    });
    const currentBalance = (existingEntries || []).reduce((sum, e) => sum + (e.amount || 0), 0);
    const newBalance = currentBalance + reward.amount;

    // Create the ledger entry
    await base44.asServiceRole.entities.ReferralCreditLedger.create({
      customer_id: referral.referrer_customer_id,
      customer_name: referral.referrer_customer_name,
      referral_id: referral_id,
      transaction_type: "EARN",
      amount: reward.amount,
      balance_after: newBalance,
      related_order_id: related_order_id || "",
      reason: `${reward.reward_type === "PREFERRED_REFERRAL_REWARD" ? "Preferred" : "Standard"} referral: ${referral.referred_party_name}`,
      actor: actor_name || "system",
      timestamp: now,
      reward_type: reward.reward_type,
      cash_eligible: reward.cash_eligible,
    });

    return Response.json({
      success: true,
      reward_amount: reward.amount,
      reward_type: reward.reward_type,
      is_preferred_referrer: reward.is_preferred_referrer,
      cash_eligible: reward.cash_eligible,
      new_balance: newBalance,
    });
  } catch (error) {
    console.error("qualifyReferral error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}