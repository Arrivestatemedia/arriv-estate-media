// ============================================================================
// AGREEMENT SECURITY
// 
// Cryptographically secure token generation, hashing, and validation for
// Arriv Agreements signing sessions.
// ============================================================================

/**
 * Generate a cryptographically secure random token.
 * Uses Web Crypto API (available in Deno).
 */
export function generateSecureToken(length: number = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a cryptographically secure agreement ID.
 */
export function generateAgreementId(): string {
  const ts = Date.now();
  const rand = generateSecureToken(6);
  return `agrmt_${ts}_${rand}`;
}

/**
 * Generate a cryptographically secure recipient ID.
 */
export function generateRecipientId(): string {
  return `rcpt_${generateSecureToken(12)}`;
}

/**
 * Generate a cryptographically secure session ID.
 */
export function generateSessionId(): string {
  return `sess_${generateSecureToken(16)}`;
}

/**
 * Generate a cryptographically secure field ID.
 */
export function generateFieldId(): string {
  return `fld_${generateSecureToken(8)}`;
}

/**
 * Generate a cryptographically secure event ID.
 */
export function generateEventId(): string {
  return `evt_${generateSecureToken(12)}`;
}

/**
 * Generate a cryptographically secure template ID.
 */
export function generateTemplateId(): string {
  const ts = Date.now();
  return `agtmplt_${ts}_${generateSecureToken(6)}`;
}

/**
 * Generate a certificate ID.
 */
export function generateCertificateId(): string {
  return `cert_${generateSecureToken(12)}`;
}

/**
 * Hash a token for storage. We never store raw signing tokens.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hash of a string (document content, certificate data, etc.)
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time token comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Generate a signing URL for a recipient.
 * Uses the app domain from environment + opaque token (never the recipient ID).
 */
export function buildSigningUrl(sessionToken: string): string {
  const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'arrivestatemedia.base44.app';
  return `https://${appDomain}/AgreementSigning?token=${sessionToken}`;
}

/**
 * Default session TTL: 72 hours
 */
export const SESSION_TTL_HOURS = 72;

/**
 * Default presence timeout: 90 seconds without heartbeat
 */
export const PRESENCE_TIMEOUT_SECONDS = 90;

/**
 * Rate limit: max signing attempts per minute per token
 */
export const MAX_SIGNING_ATTEMPTS_PER_MINUTE = 30;