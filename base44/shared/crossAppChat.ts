// Cross-app chat bridge helpers shared between sendCrossAppChatMessage and
// receiveArrivOneChatMessage. Both Estate Media and Arriv One must implement
// the same channel ID convention and same-company check.

/**
 * Deterministic cross-app DM channel ID from two participant emails.
 * Emails are lowercased and sorted so both apps produce the same ID.
 * Format: cross_app_dm:<lower_email>:<higher_email>
 *
 * This is the LEGACY channel. It is retained as alias_channel_id so
 * historical messages remain visible after migration to the immutable
 * channel. Do NOT delete or rewrite historical messages.
 */
export function generateCrossAppChannelId(emailA: string, emailB: string): string {
  const a = (emailA || "").toLowerCase().trim();
  const b = (emailB || "").toLowerCase().trim();
  const sorted = [a, b].sort();
  return `cross_app_dm:${sorted[0]}:${sorted[1]}`;
}

/**
 * Immutable cross-app DM channel ID from two participant immutable IDs.
 * IDs are trimmed and sorted so both apps produce the same ID byte-for-byte.
 * Format: cross_app_dm_id:<lower_id>:<higher_id>
 *
 * This is the PRIMARY channel when BOTH participants have immutable_shared_id.
 * Arriv One resolves immutable IDs through CrossAppRecordMapping; Estate Media
 * resolves them from SalesTeamMember.immutable_shared_id (synced from Arriv One).
 */
export function generateImmutableChannelId(idA: string, idB: string): string {
  const a = (idA || "").trim();
  const b = (idB || "").trim();
  const sorted = [a, b].sort();
  return `cross_app_dm_id:${sorted[0]}:${sorted[1]}`;
}

/**
 * Resolve the canonical cross-app channel for two participants.
 *
 * When BOTH immutable_shared_id values are available, the immutable channel
 * is primary and the email-derived channel is the alias. When either
 * immutable ID is missing, the email-derived channel is primary (no alias).
 *
 * Returns { primary, alias } where alias may be null.
 *
 * Reads must check BOTH primary and alias so historical messages written
 * under the legacy email channel remain visible after migration.
 */
export function resolveCrossAppChannel(
  emailA: string,
  emailB: string,
  immutableIdA: string | null | undefined,
  immutableIdB: string | null | undefined
): { primary: string; alias: string | null } {
  const aliasChannel = generateCrossAppChannelId(emailA, emailB);
  if (immutableIdA && immutableIdB) {
    return {
      primary: generateImmutableChannelId(immutableIdA, immutableIdB),
      alias: aliasChannel,
    };
  }
  return { primary: aliasChannel, alias: null };
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
 * Tenant allowlist for cross-app chat. Arriv Estate Media may only see and
 * communicate with employees from these two Arriv One tenants:
 *   - tnt_arriv_one      (Arriv One company)
 *   - tnt_estate_media   (Arriv Estate Media company)
 * No other Arriv One tenant (e.g. Test Company Inc) is visible or reachable.
 */
export const ALLOWED_CROSS_APP_TENANTS: string[] = [
  "tnt_arriv_one",
  "tnt_estate_media",
];

/**
 * Returns true if the given tenant_id is in the cross-app chat allowlist.
 */
export function isAllowedCrossAppTenant(tenantId: string | undefined | null): boolean {
  return !!tenantId && ALLOWED_CROSS_APP_TENANTS.includes(tenantId);
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