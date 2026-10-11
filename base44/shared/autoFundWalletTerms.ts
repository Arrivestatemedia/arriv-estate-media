// ============================================================================
// ARRIV AUTO-FUND — WALLET TERMS: AUTHORITATIVE FACTS AND UNRESOLVED QUESTIONS
// ============================================================================
// The wallet disclosure must state what the system ACTUALLY does. This module
// therefore separates two things that must never be conflated:
//
//   FACTS      — verified directly against the running code. Safe to disclose.
//   UNRESOLVED — a legal or commercial decision that does NOT exist yet. These
//                are reported as blockers and are NEVER turned into customer-
//                facing rights, expiry rules or cash-out promises.
//
// No refund right, expiry rule, cash-out capability or escheat position is
// invented here. If it is not implemented, it is listed as unresolved.
// ============================================================================

/** All wallet disclosure text is provisional until counsel approves it. */
export const WALLET_TERMS_STATUS = 'pending_legal_review' as const;

/**
 * FACT — verified in autoFundProcessor.ts: every funding lot (Auto-Fund recurring
 * reloads and top-ups alike) is created with `addMonths(new Date(), 12)`.
 */
export const AUTOFUND_LOT_VALIDITY_MONTHS = 12;

/**
 * FACT — verified in workflows/Prepaid Lot Expiration (daily).jsonc →
 * managePrepaid `expire_lots`, which marks past-due lots expired, writes an
 * EXPIRATION wallet transaction and reduces the wallet balance.
 */
export const AUTOFUND_EXPIRY_ENFORCED = true;

export const AUTOFUND_WALLET_FACTS = {
  /** Cancelling Auto-Fund does not touch the wallet (manageAutoFund `cancel`). */
  balance_preserved_on_cancellation: true,
  /** No customer-initiated withdrawal of wallet balance is implemented. */
  customer_cash_out_available: false,
  /** No customer-initiated refund of unused wallet balance is implemented. */
  customer_initiated_balance_refund_available: false,
  /** Lots carry a 12-month validity and a daily process enforces it. */
  lot_validity_months: AUTOFUND_LOT_VALIDITY_MONTHS,
  lot_expiry_enforced: AUTOFUND_EXPIRY_ENFORCED,
  /**
   * The ONLY path that reverses wallet value is walletRefundEngine, and it runs
   * from an Arriv Pay refund/chargeback webhook — never from a customer request.
   */
  balance_reduction_paths: [
    'booking_redemption',
    'lot_expiration',
    'admin_adjustment',
    'provider_confirmed_refund_reversal',
  ],
} as const;

export interface UnresolvedWalletQuestion {
  id: string;
  question: string;
  why_it_blocks: string;
}

/**
 * Questions implementation cannot answer. Each is a launch blocker until
 * counsel resolves it. None of these may be replaced by invented copy.
 */
export const AUTOFUND_WALLET_UNRESOLVED: UnresolvedWalletQuestion[] = [
  {
    id: 'WALLET_REFUND_RIGHTS',
    question: 'Does a customer have any right to a refund of unused cash-funded Booking Value?',
    why_it_blocks:
      'No refund capability exists for this at all. Presenting any refund right would promise something the system cannot perform.',
  },
  {
    id: 'WALLET_EXPIRY_LAWFULNESS',
    question: 'May cash-funded Booking Value expire after 12 months?',
    why_it_blocks:
      'The system DOES expire these lots today. Whether expiring customer-funded value is lawful has not been determined, so the behaviour may itself require change.',
  },
  {
    id: 'UNCLAIMED_PROPERTY',
    question: 'Are dormant wallet balances subject to unclaimed-property or escheat obligations, and at what dormancy period?',
    why_it_blocks:
      'No dormancy tracking, reporting or escheat process exists. This is unresolved financial exposure and cannot be solved by code alone.',
  },
  {
    id: 'REDEEMED_CREDIT_REVERSAL',
    question: 'If a refund is issued after Booking Value was already redeemed, who bears the redeemed portion?',
    why_it_blocks:
      'walletRefundEngine reverses only the unredeemed portion and explicitly reports the redeemed portion as an unresolved decision.',
  },
  {
    id: 'BALANCE_AT_CANCELLATION',
    question: 'On cancellation, must an unused cash-funded balance be returned to the customer rather than left as usable value?',
    why_it_blocks:
      'Current behaviour preserves the balance as usable Booking Value. Whether that satisfies applicable law is undetermined.',
  },
  {
    id: 'DORMANT_BALANCE_TRACKING',
    question: 'Must dormant balances be tracked, reported or treated in a particular way, and from what dormancy period?',
    why_it_blocks:
      'No dormancy tracking exists. Balances simply persist as usable value until their lot expires, so any dormancy obligation is currently unmeasured rather than satisfied.',
  },
];

/**
 * The owner-listed wallet topics, each marked DETERMINED (a verified fact that is
 * safe to state) or UNRESOLVED (blocked on a legal determination, and therefore
 * never turned into customer copy). No expiry rule, forfeiture rule or cash-out
 * right is invented here: an unresolved topic stays unresolved until counsel
 * decides it.
 */
export interface WalletTopic {
  topic: string;
  status: 'determined' | 'unresolved';
  statement?: string;
  unresolved_id?: string;
}

export const AUTOFUND_WALLET_TOPICS: WalletTopic[] = [
  {
    topic: 'Cash-funded versus promotional Booking Value',
    status: 'determined',
    statement:
      'Booking Value is either cash-funded (from your own deposits) or promotional (granted by Arriv at no cash cost to you). A lot records which it is, so promotional value can never be mistaken for cash-funded value.',
  },
  {
    topic: 'Rollover of unused value between cycles',
    status: 'determined',
    statement:
      'Unused Booking Value is not re-issued, extended or reset at a billing-cycle boundary. Each funding lot keeps the validity it was issued with, and your balance is the total of the lots that have not expired.',
  },
  {
    topic: 'Redemption eligibility',
    status: 'determined',
    statement:
      'Cash-funded Booking Value can be redeemed against any Arriv service. Promotional Booking Value applies only up to the retail value of eligible services actually present in the cart, and on the VIP tier it cannot be applied to a standalone MLS Walkthrough.',
  },
  {
    topic: 'Cancellation',
    status: 'determined',
    statement:
      'Cancelling stops future recurring charges and does not erase, forfeit or confiscate cash-funded Booking Value; the balance stays in the wallet and remains usable. Whether an unused balance must instead be returned is a separate open question (BALANCE_AT_CANCELLATION).',
  },
  { topic: 'Refunds of unused wallet balance', status: 'unresolved', unresolved_id: 'WALLET_REFUND_RIGHTS' },
  { topic: 'Dormant balances', status: 'unresolved', unresolved_id: 'DORMANT_BALANCE_TRACKING' },
  { topic: 'Unclaimed-property and escheat obligations', status: 'unresolved', unresolved_id: 'UNCLAIMED_PROPERTY' },
  {
    topic: 'Treatment of balances following a dispute',
    status: 'determined',
    statement:
      'An open dispute suspends the unspent value it relates to, per lot, so the suspended value cannot be spent; it is not redeemed, expired or charged as a fee, and the lot keeps its remaining value. If the dispute is resolved in your favour the exact amount is restored. If it is lost, the suspended value is reversed. Treatment of any already-redeemed portion is a separate open question (REDEEMED_CREDIT_REVERSAL).',
  },
  { topic: 'Expiry of cash-funded value', status: 'unresolved', unresolved_id: 'WALLET_EXPIRY_LAWFULNESS' },
];

/** True when the wallet terms are still awaiting legal approval. */
export function walletTermsPendingLegal(): boolean {
  return WALLET_TERMS_STATUS === 'pending_legal_review';
}

export interface WalletTermsDisclosure {
  status: typeof WALLET_TERMS_STATUS;
  /** Statements verified against the running system. */
  verified_statements: string[];
  /** Questions still awaiting legal determination. */
  unresolved_questions: string[];
  /** Whether a customer can currently obtain cash back from their wallet. */
  cash_out_available: boolean;
  /** Whether the balance is preserved when the membership is cancelled. */
  balance_preserved_on_cancellation: boolean;
  /** Validity applied to a funding lot, in months. */
  lot_validity_months: number;
  /** Every owner-listed wallet topic, marked determined or unresolved. */
  topics: WalletTopic[];
}

/**
 * The wallet section of the customer disclosure.
 *
 * It states only verified behaviour and names the questions that are still open.
 * It deliberately does NOT assert a refund right, a non-expiry guarantee, or a
 * cash-out option, because none of those exist or have been approved.
 */
export function buildWalletTermsDisclosure(): WalletTermsDisclosure {
  return {
    status: WALLET_TERMS_STATUS,
    cash_out_available: AUTOFUND_WALLET_FACTS.customer_cash_out_available,
    balance_preserved_on_cancellation: AUTOFUND_WALLET_FACTS.balance_preserved_on_cancellation,
    lot_validity_months: AUTOFUND_WALLET_FACTS.lot_validity_months,
    verified_statements: [
      'Cancelling your Auto-Fund membership does not erase, forfeit or confiscate the Booking Value funded by your own cash deposits. Your balance stays in your wallet and remains usable.',
      `Booking Value is issued to your wallet in funding lots. Each lot currently carries a ${AUTOFUND_WALLET_FACTS.lot_validity_months}-month validity, and a daily process retires a lot once that period ends.`,
      'Arriv does not currently offer cash withdrawal, cash-out or a customer-requested refund of wallet balance. Wallet balance is used toward services.',
    ],
    unresolved_questions: AUTOFUND_WALLET_UNRESOLVED.map(q => q.question),
    topics: AUTOFUND_WALLET_TOPICS,
  };
}