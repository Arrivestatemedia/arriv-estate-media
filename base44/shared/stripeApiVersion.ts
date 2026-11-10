// The one Stripe API version this application speaks.
//
// The live webhook endpoint is pinned to 2025-12-15.clover, so every request this app makes to Stripe
// must use the same version. Otherwise the webhook and our own API calls would be reading two different
// object shapes of the same subscription, which is exactly how a billing period quietly goes missing.
//
// This value is a version string, never a secret.
export const STRIPE_API_VERSION = "2025-12-15.clover";

export function stripeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "Stripe-Version": STRIPE_API_VERSION, ...extra };
}