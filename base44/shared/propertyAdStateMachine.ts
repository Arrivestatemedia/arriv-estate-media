// Advertising campaign state machine.
//
// The important property of this graph: money can never move a campaign past
// READY_FOR_REVIEW on its own. Reaching SUBMITTED requires an approved creative, a recorded
// customer authorization, verified payment, an administrative approval, a connected provider
// account, and the execution switches enabled — each checked server-side at launch time.

export const AD_STATUSES = [
  "DRAFT",
  "AWAITING_CUSTOMER_APPROVAL",
  "APPROVED",
  "AWAITING_PAYMENT",
  "PAID",
  "READY_FOR_REVIEW",
  "READY_TO_LAUNCH",
  "SUBMITTED",
  "ACTIVE",
  "COMPLETED",
  "REJECTED",
  "PAUSED",
  "FAILED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
] as const;

export type AdStatus = (typeof AD_STATUSES)[number];

export const AD_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_CUSTOMER_APPROVAL: "Awaiting your approval",
  APPROVED: "Approved",
  AWAITING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  READY_FOR_REVIEW: "Awaiting Arriv review",
  READY_TO_LAUNCH: "Ready to launch",
  SUBMITTED: "Submitted to platform",
  ACTIVE: "Running",
  COMPLETED: "Completed",
  REJECTED: "Not launched",
  PAUSED: "Paused",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  REFUND_PENDING: "Refund under review",
  REFUNDED: "Refunded",
};

export const AD_STATUS_HELP: Record<string, string> = {
  DRAFT: "Your campaign is being prepared.",
  AWAITING_CUSTOMER_APPROVAL: "Review the creative and confirm your authorization to continue.",
  APPROVED: "You approved the campaign. Payment is the next step.",
  AWAITING_PAYMENT: "The payment has not completed yet.",
  PAID: "Payment received. Arriv is reviewing the campaign before launch.",
  READY_FOR_REVIEW: "Arriv is checking the campaign and the advertising account before launch.",
  READY_TO_LAUNCH: "Approved and scheduled. It launches at the earliest permitted time.",
  SUBMITTED: "The advertising platform has the campaign and is processing it.",
  ACTIVE: "The campaign is running.",
  COMPLETED: "The campaign has ended. Results are shown below.",
  REJECTED: "This campaign was not launched. Any unused advertising budget is reviewed for refund.",
  PAUSED: "The campaign is stopped. Advertising stops while it is paused.",
  FAILED: "The platform reported a failure. An administrator has been notified.",
  CANCELLED: "The campaign was cancelled before launch.",
  REFUND_PENDING: "A refund decision is pending.",
  REFUNDED: "This campaign was refunded.",
};

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["AWAITING_CUSTOMER_APPROVAL", "CANCELLED"],
  AWAITING_CUSTOMER_APPROVAL: ["APPROVED", "AWAITING_CUSTOMER_APPROVAL", "CANCELLED"],
  APPROVED: ["AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["READY_FOR_REVIEW", "REFUND_PENDING"],
  READY_FOR_REVIEW: ["READY_TO_LAUNCH", "REJECTED", "REFUND_PENDING"],
  READY_TO_LAUNCH: ["SUBMITTED", "PAUSED", "REJECTED", "CANCELLED", "REFUND_PENDING"],
  SUBMITTED: ["ACTIVE", "PAUSED", "FAILED", "REFUND_PENDING"],
  ACTIVE: ["PAUSED", "COMPLETED", "FAILED", "REFUND_PENDING"],
  PAUSED: ["ACTIVE", "SUBMITTED", "COMPLETED", "CANCELLED", "FAILED", "REFUND_PENDING"],
  // A failed campaign is only ever returned to READY_TO_LAUNCH by an explicit administrator
  // decision, never by automatic retry.
  FAILED: ["READY_TO_LAUNCH", "CANCELLED", "REFUND_PENDING", "REFUNDED"],
  COMPLETED: ["REFUND_PENDING", "REFUNDED"],
  REJECTED: ["REFUND_PENDING", "CANCELLED", "REFUNDED"],
  CANCELLED: ["REFUND_PENDING", "REFUNDED"],
  REFUND_PENDING: ["REFUNDED", "PAID", "COMPLETED", "CANCELLED"],
  REFUNDED: [],
};

export function canTransition(from: string, to: string): boolean {
  if (!from || !to) return false;
  if (from === to) return true;
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from: string, to: string) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid campaign transition ${from} → ${to}`);
  }
}

export const AD_LIVE_STATUSES = ["SUBMITTED", "ACTIVE"];

// Statuses in which advertising could be running at the platform.
export function isLive(status: string): boolean {
  return AD_LIVE_STATUSES.includes(status);
}

export const AD_TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "REFUNDED", "REJECTED"];

export function isTerminal(status: string): boolean {
  return AD_TERMINAL_STATUSES.includes(status);
}

export function isPaid(status: string): boolean {
  return !["DRAFT", "AWAITING_CUSTOMER_APPROVAL", "APPROVED", "AWAITING_PAYMENT", "FAILED", "CANCELLED"].includes(status);
}

// Payment moves a campaign to review, never to launch.
export function statusAfterPayment(): AdStatus {
  return "READY_FOR_REVIEW";
}

export const AD_CUSTOMER_ACTIONS: Record<string, string[]> = {
  DRAFT: ["review"],
  AWAITING_CUSTOMER_APPROVAL: ["approve", "cancel"],
  APPROVED: ["pay"],
  AWAITING_PAYMENT: ["pay", "cancel"],
  PAID: [],
  READY_FOR_REVIEW: [],
  READY_TO_LAUNCH: ["cancel"],
  SUBMITTED: [],
  ACTIVE: [],
  COMPLETED: [],
  PAUSED: [],
  REJECTED: [],
  FAILED: [],
  CANCELLED: [],
  REFUND_PENDING: [],
  REFUNDED: [],
};