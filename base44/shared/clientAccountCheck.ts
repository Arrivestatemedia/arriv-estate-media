/**
 * Check whether a client already has an account they can log in with.
 * A client "has an account" if they exist in PendingSignup (custom auth)
 * OR in the platform User entity.
 *
 * Case-insensitive email match, with full-list fallback (same pattern
 * as verifySignIn).
 */
export async function checkClientHasAccount(base44: any, email: string): Promise<boolean> {
  const emailLower = (email || "").trim().toLowerCase();
  if (!emailLower) return false;

  // Check PendingSignup first
  try {
    const pending = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower });
    if ((pending || []).find((u: any) => u.email && u.email.toLowerCase() === emailLower)) {
      return true;
    }
    // Fall back to full list (case-insensitive)
    const allPending = await base44.asServiceRole.entities.PendingSignup.list();
    if ((allPending || []).find((u: any) => u.email && u.email.toLowerCase() === emailLower)) {
      return true;
    }
  } catch (_e) {
    /* table may not exist */
  }

  // Check User entity
  try {
    const users = await base44.asServiceRole.entities.User.filter({ email: emailLower });
    if ((users || []).find((u: any) => u.email && u.email.toLowerCase() === emailLower)) {
      return true;
    }
    const allUsers = await base44.asServiceRole.entities.User.list();
    if ((allUsers || []).find((u: any) => u.email && u.email.toLowerCase() === emailLower)) {
      return true;
    }
  } catch (_e) {
    /* table may not exist */
  }

  return false;
}