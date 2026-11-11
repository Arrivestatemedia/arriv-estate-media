// The moment advertising money actually moves.
//
// A customer's card is authorized when they buy a campaign, and captured only when the campaign is
// about to start running — which can only happen once the property page is approved and live. This
// module is the single place that performs that capture, so the charge always follows the delivery
// milestone and never precedes it.

import { captureAdPayment, verifyAdPayment, voidAdAuthorization } from "./stripeAdPayments.ts";
import { recordPaymentCaptured, recordPaymentCaptureFailed, recordPaymentVoided } from "./propertyAdEngine.ts";

export interface CaptureResult {
  ok: boolean;
  code?: string;
  reason?: string;
  campaign?: any;
}

export async function ensureCampaignCaptured(
  client: any,
  campaign: any,
  input: { actor: string; now?: Date },
): Promise<CaptureResult> {
  const now = input.now || new Date();
  if (campaign?.payment_state === "captured") return { ok: true, campaign };

  const intentId = String(campaign?.stripe_payment_intent_id || "");
  if (!intentId) {
    const saved = await recordPaymentCaptureFailed(client, campaign, {
      reason: "No payment is on file for this campaign.",
      actor: input.actor,
      now,
    });
    return { ok: false, code: "NO_PAYMENT_ON_FILE", reason: "No payment is on file for this campaign.", campaign: saved.campaign };
  }
  if (campaign?.payment_state === "voided") {
    return { ok: false, code: "PAYMENT_RELEASED", reason: "The card authorization for this campaign was released.", campaign };
  }

  const result = await captureAdPayment(intentId);
  if (!result.ok) {
    // A payment that was already taken (an older campaign, or a repeat run) is not a failure: Stripe
    // is asked what really happened before anything is blocked or flagged.
    const verified = await verifyAdPayment(intentId).catch(() => null);
    if (verified?.captured) {
      const savedAlready = await recordPaymentCaptured(client, campaign, {
        amountCents: verified.amountCents,
        actor: input.actor,
        reference: intentId,
        now,
      });
      return { ok: true, campaign: savedAlready.campaign };
    }
    const saved = await recordPaymentCaptureFailed(client, campaign, {
      reason: result.error || "Stripe did not take the held payment.",
      actor: input.actor,
      now,
    });
    return { ok: false, code: "PAYMENT_NOT_CAPTURED", reason: result.error || "", campaign: saved.campaign };
  }

  const saved = await recordPaymentCaptured(client, campaign, {
    amountCents: result.amountCents,
    actor: input.actor,
    reference: intentId,
    now,
  });
  return { ok: true, campaign: saved.campaign };
}

// Used when a campaign is cancelled or rejected before it ever runs: nothing was charged, so the
// hold is simply released.
export async function releaseCampaignAuthorization(
  client: any,
  campaign: any,
  input: { actor: string; note?: string; now?: Date },
): Promise<CaptureResult> {
  const now = input.now || new Date();
  if (!campaign || campaign.payment_state === "captured" || campaign.payment_state === "voided") {
    return { ok: true, campaign };
  }
  const intentId = String(campaign?.stripe_payment_intent_id || "");
  if (!intentId) return { ok: true, campaign };

  const result = await voidAdAuthorization(intentId);
  if (!result.ok) {
    // The money may already have been taken (an older campaign): that needs a refund decision, not
    // a silent release.
    const verified = await verifyAdPayment(intentId).catch(() => null);
    if (verified?.captured) {
      const savedAlready = await recordPaymentCaptured(client, campaign, {
        amountCents: verified.amountCents,
        actor: input.actor,
        reference: intentId,
        now,
      });
      return { ok: false, code: "ALREADY_CHARGED", reason: "The payment was already taken for this campaign.", campaign: savedAlready.campaign };
    }
    return { ok: false, code: "RELEASE_FAILED", reason: result.error || "", campaign };
  }
  const saved = await recordPaymentVoided(client, campaign, {
    actor: input.actor,
    note: input.note || "Nothing was charged; the card hold was released",
    now,
  });
  return { ok: true, campaign: saved.campaign };
}