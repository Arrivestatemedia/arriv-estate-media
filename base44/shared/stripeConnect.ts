// Shared helpers for the Stripe Connect payout flow.
// Used by stripeConnectOnboard, processWeeklyPayouts, and handleStripeWebhook.

export async function findPartnerRecord(base44, email) {
  if (!email) return null;
  const normalized = String(email).toLowerCase();
  const signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: normalized });
  if (signups && signups.length > 0) {
    return { collection: 'PendingSignup', id: signups[0].id, record: signups[0] };
  }
  const users = await base44.asServiceRole.entities.User.filter({ email: normalized });
  if (users && users.length > 0) {
    return { collection: 'User', id: users[0].id, record: users[0] };
  }
  return null;
}

export async function updatePartnerRecord(base44, rec, data) {
  if (!rec) return null;
  if (rec.collection === 'PendingSignup') {
    return base44.asServiceRole.entities.PendingSignup.update(rec.id, data);
  }
  return base44.asServiceRole.entities.User.update(rec.id, data);
}

// Most recent Friday at 08:00 UTC (≈ 4am US Eastern during DST).
// Mirrors the dashboard's "since last Friday 4am" pay-period window.
export function getPayPeriodStartUTC() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sun ... 5 = Fri
  const daysSinceFriday = (day + 2) % 7;
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceFriday,
    8, 0, 0
  ));
}