// Additional brokerage seats: the decision, kept pure.
//
// A seat change is a billing change, so every rule lives here and the caller only carries it out. The
// rules exist to prevent three specific failures: selling seats on a plan that does not include them,
// billing a price that is not the seat price, and charging a seat twice because a request was repeated.

export const SEAT_MIN_PURCHASED = 0;
// A ceiling so one request can never authorise an unlimited roster.
export const SEAT_MAX_PURCHASED = 50;

export interface SeatChangeInput {
  record: any;
  plan: any;
  requestedSeats: any;
  checkoutEnabled: boolean;
}

export interface SeatChangeDecision {
  ok: boolean;
  error: string;
  seatPriceId: string;
  previous: number;
  quantity: number;
  increase: boolean;
  noop: boolean;
  prorationBehavior: "always_invoice" | "create_prorations" | "none";
  needsInvoice: boolean;
  monthlyTotalCents: number;
  seatPriceCents: number;
  includedSeats: number;
}

function wholeSeats(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (Math.round(parsed) !== parsed) return null;
  return parsed;
}

export function seatChangeDecision({ record, plan, requestedSeats, checkoutEnabled }: SeatChangeInput): SeatChangeDecision {
  const seatPriceId = String(plan?.stripe_seat_price_id || "");
  const seatPriceCents = Number(plan?.additional_seat_price_cents || 0);
  const includedSeats = Number(plan?.seats_included ?? 1);
  const previous = Math.max(0, Number(record?.seats_purchased || 0));
  const monthlyTotalCents = Number(plan?.price_cents || 0) + previous * seatPriceCents;

  const refused = (error: string): SeatChangeDecision => ({
    ok: false,
    error,
    seatPriceId,
    previous,
    quantity: previous,
    increase: false,
    noop: false,
    prorationBehavior: "none",
    needsInvoice: false,
    monthlyTotalCents,
    seatPriceCents,
    includedSeats,
  });

  if (String(plan?.seat_policy || "") !== "per_seat") {
    return refused("This plan does not allow additional seats.");
  }
  if (seatPriceCents <= 0) {
    return refused("This plan has no additional seat price configured.");
  }
  if (!seatPriceId) {
    return refused("The additional seat is not configured for billing yet.");
  }
  if (seatPriceId === String(plan?.stripe_price_id || "")) {
    return refused("The seat price must be a separate Stripe price from the plan itself.");
  }
  if (!checkoutEnabled) {
    return refused("Subscription billing is currently switched off.");
  }
  if (!record?.stripe_subscription_id) {
    return refused("This subscription has no Stripe billing to change yet.");
  }
  if (String(record?.status || "") !== "active") {
    return refused("Seats can only be changed while the subscription is active.");
  }

  const quantity = wholeSeats(requestedSeats);
  if (quantity === null || quantity < SEAT_MIN_PURCHASED || quantity > SEAT_MAX_PURCHASED) {
    return refused(`Enter a whole number of additional seats between ${SEAT_MIN_PURCHASED} and ${SEAT_MAX_PURCHASED}.`);
  }

  const increase = quantity > previous;
  const noop = quantity === previous;

  return {
    ok: true,
    error: "",
    seatPriceId,
    previous,
    quantity,
    increase,
    noop,
    // Added seats are billed immediately; removed seats are credited on the next invoice so the
    // customer is never charged and refunded in the same breath.
    prorationBehavior: noop ? "none" : increase ? "always_invoice" : "create_prorations",
    needsInvoice: !noop && increase,
    monthlyTotalCents: Number(plan?.price_cents || 0) + quantity * seatPriceCents,
    seatPriceCents,
    includedSeats,
  };
}

// What the customer is entitled to hold, from the record alone.
export function seatAllowanceFrom(record: any, plan: any) {
  const included = Number(plan?.seats_included ?? record?.seats_included ?? 1);
  const purchased = Math.max(0, Number(record?.seats_purchased || 0));
  return {
    included,
    purchased,
    total: included + purchased,
    seat_price_cents: Number(plan?.additional_seat_price_cents || 0),
    can_change: String(plan?.seat_policy || "") === "per_seat"
      && Number(plan?.additional_seat_price_cents || 0) > 0
      && !!String(plan?.stripe_seat_price_id || ""),
  };
}