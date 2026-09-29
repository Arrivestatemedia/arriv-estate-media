// ============================================================================
// B2B CREDIT UNITS — Fixed-precision arithmetic for financial entitlement.
//
// 1 credit = 100 credit units (integer).
// All ledger arithmetic uses integer units to avoid floating-point errors.
// The API converts to decimal credits for display only.
//
// Examples:
//   0.45 credits = 45 units
//   1.73 credits = 173 units
//   7.64 credits = 764 units
// ============================================================================

export const CREDIT_SCALE = 100; // 1 credit = 100 units

/** Convert decimal credits to integer credit units (rounds to nearest unit). */
export function creditsToUnits(credits: number): number {
  return Math.round(credits * CREDIT_SCALE);
}

/** Convert integer credit units to decimal credits (2 decimal places). */
export function unitsToCredits(units: number): number {
  return Math.round(units) / CREDIT_SCALE;
}

/** Format credit units as a display string (e.g. "2.45"). */
export function formatCredits(units: number): string {
  return (Math.round(units) / CREDIT_SCALE).toFixed(2);
}

/** Add two unit values safely (integers). */
export function addUnits(a: number, b: number): number {
  return Math.round(a) + Math.round(b);
}

/** Subtract two unit values safely (integers). */
export function subUnits(a: number, b: number): number {
  return Math.round(a) - Math.round(b);
}

/** Multiply credit units by a scalar (e.g. overage multiplier), returning integer units. */
export function mulUnits(units: number, scalar: number): number {
  return Math.round((Math.round(units) * scalar));
}

/** Divide credit units by a divisor, returning integer units (rounded). */
export function divUnits(units: number, divisor: number): number {
  if (divisor === 0) return 0;
  return Math.round(Math.round(units) / divisor);
}