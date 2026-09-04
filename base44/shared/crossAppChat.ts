// Cross-app chat bridge helpers shared between sendCrossAppChatMessage and
// receiveArrivOneChatMessage. Both Estate Media and Arriv One must implement
// the same channel ID convention and same-company check.

/**
 * Deterministic cross-app DM channel ID from two participant emails.
 * Emails are lowercased and sorted so both apps produce the same ID.
 * Format: cross_app_dm:<lower_email>:<higher_email>
 */
export function generateCrossAppChannelId(emailA: string, emailB: string): string {
  const a = (emailA || "").toLowerCase().trim();
  const b = (emailB || "").toLowerCase().trim();
  const sorted = [a, b].sort();
  return `cross_app_dm:${sorted[0]}:${sorted[1]}`;
}

/**
 * Extract the domain part of an email address (lowercased).
 */
export function getEmailDomain(email: string): string {
  if (!email) return "";
  const parts = email.split("@");
  return parts.length > 1 ? parts[1].toLowerCase().trim() : "";
}

/**
 * Same-company check: two users belong to the same company if their email
 * domains match. This is the gate for cross-app chat — only same-company
 * users can see each other and exchange messages.
 */
export function isSameCompany(emailA: string, emailB: string): boolean {
  const domainA = getEmailDomain(emailA);
  const domainB = getEmailDomain(emailB);
  return !!domainA && !!domainB && domainA === domainB;
}