// ============================================================================
// MONEY UTILITY — All financial calculations use integer cents.
// $1.00 = 100 cents. Never use floating-point for financial ledger authority.
// Every function here is pure and deterministic.
// ============================================================================

/** Convert a dollar amount (float) to integer cents. */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Convert integer cents to a dollar amount (float, for display only). */
export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/** Round a cents value to the nearest integer cent (deterministic half-up). */
export function roundCents(cents: number): number {
  return Math.round(cents);
}

/** Apply a rate (e.g., 0.15 = 15%) to a cents value, returning rounded cents. */
export function applyRate(cents: number, rate: number): number {
  return Math.round(Math.round(cents) * rate);
}

/** Add multiple cents values safely. */
export function addCents(...amounts: number[]): number {
  return amounts.reduce((sum, a) => sum + Math.round(a), 0);
}

/** Subtract b from a, both in cents. */
export function subtractCents(a: number, b: number): number {
  return Math.round(a) - Math.round(b);
}

/** Format cents as a dollar string: 51750 -> "$517.50" */
export function formatCents(cents: number): string {
  return `$${(Math.round(cents) / 100).toFixed(2)}`;
}

/** Format cents as a plain decimal string: 51750 -> "517.50" */
export function centsToDecimalString(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

/** Reconciliation check: verify that parts sum to a total. Returns mismatch in cents. */
export function reconcileCents(total: number, ...parts: number[]): number {
  const sumParts = parts.reduce((sum, p) => sum + Math.round(p), 0);
  return Math.round(total) - sumParts;
}