import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { CASH_OUT_MINIMUM } from "../../shared/referralRewards.ts";

// Request a cash-out of referral credits. Minimum $260 cash-eligible balance.
// Creates a ReferralCashOutRequest for admin review.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { customer_id, customer_name, customer_email, requested_amount, payout_method } = body;

    if (!customer_id || !requested_amount) {
      return Response.json({ error: "customer_id and requested_amount are required" }, { status: 400 });
    }

    // Calculate cash-eligible balance from the ledger
    const ledgerEntries = await base44.asServiceRole.entities.ReferralCreditLedger.filter({
      customer_id,
    });

    let cashEligibleBalance = 0;
    for (const entry of ledgerEntries || []) {
      if (entry.cash_eligible) {
        cashEligibleBalance += entry.amount;
      }
    }

    // Check minimum
    if (cashEligibleBalance < CASH_OUT_MINIMUM) {
      return Response.json({
        success: false,
        error: `Cash-out requires a minimum of $${CASH_OUT_MINIMUM} in cash-eligible referral credits. Current balance: $${cashEligibleBalance.toFixed(2)}`,
        cash_eligible_balance: cashEligibleBalance,
        minimum: CASH_OUT_MINIMUM,
      }, { status: 400 });
    }

    // Check requested amount doesn't exceed balance
    if (requested_amount > cashEligibleBalance) {
      return Response.json({
        success: false,
        error: `Requested amount ($${requested_amount}) exceeds cash-eligible balance ($${cashEligibleBalance.toFixed(2)})`,
        cash_eligible_balance: cashEligibleBalance,
      }, { status: 400 });
    }

    // Create the cash-out request
    const cashOutRequest = await base44.asServiceRole.entities.ReferralCashOutRequest.create({
      customer_id,
      customer_name: customer_name || "",
      customer_email: customer_email || "",
      requested_amount,
      cash_eligible_balance_at_request: cashEligibleBalance,
      status: "pending",
      payout_method: payout_method || "",
      requested_at: new Date().toISOString(),
      fraud_check_passed: false,
    });

    return Response.json({
      success: true,
      request_id: cashOutRequest.id,
      status: "pending",
      cash_eligible_balance: cashEligibleBalance,
      message: "Cash-out request submitted for admin review.",
    });
  } catch (error) {
    console.error("requestReferralCashOut error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}