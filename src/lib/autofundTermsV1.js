/**
 * Auto-Fund Membership Terms — V1 (customer-facing content).
 *
 * Version: autofund_membership_v1 — must stay in step with CURRENT_TERMS_VERSION
 * in base44/shared/autoFundEnrollment.ts. A material change to this content
 * requires a new version label and refreshed customer consent.
 *
 * STATUS: draft prepared for legal review. The terms are NOT served as final
 * until the refund policy and the separate wallet terms receive legal approval,
 * so the page states that plainly rather than presenting unapproved language as
 * settled contract terms.
 */

export const AUTOFUND_TERMS_VERSION = "autofund_membership_v1";

export const AUTOFUND_TERMS_STATUS = "pending_legal_review";

export const AUTOFUND_TERMS_BANNER =
  "These membership terms are a draft prepared for legal review. The membership-fee refund policy and the separate wallet terms are not yet final, so this version is not yet the operative agreement. Auto-Fund enrollment remains closed.";

export const AUTOFUND_TERMS_SECTIONS = [
  {
    heading: "1. What you are enrolling in",
    paragraphs: [
      "Auto-Fund is a recurring monthly arrangement. Each month you are charged your total recurring monthly charge, made up of a wallet deposit and, on the Professional, Premier and VIP tiers, a separate membership fee.",
      "The total recurring monthly charge for each tier is shown on your enrollment screen and repeated in your enrollment confirmation.",
    ],
  },
  {
    heading: "2. Your wallet deposit",
    paragraphs: [
      "Your wallet deposit funds your Arriv Wallet as Booking Value and can be used toward Arriv services. Booking Value funded by your own cash deposits is referred to in these terms as cash-funded Booking Value.",
      "Booking Value is issued to your wallet in funding lots. Each lot currently carries a 12-month validity, and a daily process retires a lot once that period ends.",
      "Cancelling your membership does not erase, forfeit or confiscate cash-funded Booking Value. Your balance stays in your wallet and remains usable.",
      "Arriv does not currently offer cash withdrawal, cash-out, or a customer-requested refund of wallet balance. Wallet balance is used toward services.",
    ],
  },
  {
    heading: "3. Your membership fee (Professional, Premier and VIP)",
    paragraphs: [
      "Your membership fee is $25 per month. It is charged for access to the membership benefits listed in your disclosure during that monthly period.",
      "Your membership fee is not added to your wallet and is not spendable. It does not earn promotional Booking Value.",
      "It is billed as part of your single recurring charge, but is itemised separately on your receipt and in your billing history.",
    ],
  },
  {
    heading: "4. Promotional Booking Value and its restrictions",
    paragraphs: [
      "Your promotional bonus Booking Value is granted by Arriv at no additional cash cost to you. It applies only up to the retail value of eligible services actually present in your cart.",
      "On the VIP tier, promotional Booking Value cannot be used toward a standalone MLS Walkthrough. Your cash-funded Booking Value can be used on anything, including a standalone MLS Walkthrough.",
      "Your exact restriction is stated in your enrollment disclosure.",
    ],
  },
  {
    heading: "5. Changing your plan",
    paragraphs: [
      "You may change your Auto-Fund tier from your dashboard. A change applies to future billing periods and does not retroactively alter Booking Value already issued to you.",
    ],
  },
  {
    heading: "6. Cancelling",
    paragraphs: [
      "You can cancel at any time from your account dashboard under Auto-Fund, without contacting a salesperson, calling, or sending an email. If you enrolled online, you can cancel online.",
      "Your wallet deposit and your membership fee are one recurring charge and cannot be cancelled separately, so cancelling stops both. No further recurring charges are made once you cancel.",
      "There is no cancellation penalty and no minimum commitment.",
      "Unless the law requires otherwise, membership benefits you have already paid for remain available through the end of the membership period you have already paid for.",
      "You will receive a cancellation confirmation stating the effective cancellation date and confirming that your wallet balance has not been forfeited.",
    ],
  },
  {
    heading: "7. Membership fee refunds",
    paragraphs: [
      "A correctly charged membership fee is generally not refundable once the membership period has begun and the membership benefits for that period have been made available to you.",
      "If you are charged a membership fee for a membership period that has not yet begun, and you cancel before that period starts, that fee is refunded.",
      "Duplicate, erroneous or unauthorized membership charges are refunded.",
      "If Arriv materially fails to provide the membership benefits described in these terms, you are entitled to an appropriate refund, adjustment, or other legally required remedy.",
      "Nothing in these terms limits any refund or cancellation right you have under applicable federal or state law. Where applicable law gives you a greater right, that right applies.",
    ],
  },
  {
    heading: "8. Your wallet — refunds and unused balances",
    paragraphs: [
      "Cash-funded Booking Value is not forfeited by cancelling your membership. Promotional Booking Value remains subject to the restrictions in section 4.",
      "Booking Value is issued in lots carrying a 12-month validity, as described in section 2.",
      "Whether unused cash-funded balances must be refunded on request, whether they may expire, and how dormant balances are treated, are governed by Arriv's separately approved prepaid-service terms. Those terms are still under legal review and are not yet stated here.",
    ],
  },
  {
    heading: "9. Notices we send you",
    paragraphs: [
      "We send a durable enrollment acknowledgment after you enroll, a cancellation confirmation when you cancel, and renewal notices where applicable law requires an advance reminder before a renewal.",
      "The enrollment acknowledgment and the renewal notice state the amount and date of the recurring charge and how to cancel.",
    ],
  },
  {
    heading: "10. Consent and this version",
    paragraphs: [
      "Your enrollment records the version of these terms you accepted, the date you accepted it, and the identity of the person who accepted it. Consent must be given by the person being enrolled; an advisor cannot accept these terms on your behalf.",
      "If we change these terms in a way that materially affects you, we will notify you and, where required, obtain your renewed consent before the change applies to your billing.",
    ],
  },
];

export const AUTOFUND_TERMS_SUPPORT = {
  email: "info@arrivestatemedia.com",
  dashboard_url: "https://app.arrivestatemedia.com/AutoFund",
};