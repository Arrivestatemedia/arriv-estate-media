// passwordKdf.ts
// Canonical password hashing for Arriv Estate Media.
//
// Round 1 found unsalted SHA-256 password storage — vulnerable to rainbow tables
// and unsuitable for password storage. This module implements PBKDF2 with
// HMAC-SHA-256 (available in the Web Crypto API on Deno) as a slow KDF.
//
// Migration strategy:
//   - Legacy hashes are plain SHA-256 hex (64 hex chars, no separator).
//   - New hashes use the format: "pbkdf2$<iterations>$<salt_hex>$<hash_hex>"
//   - At login, if the stored hash is legacy format, verify with SHA-256,
//     then immediately re-hash with PBKDF2 and update the record.
//   - After migration, only PBKDF2 verification is used.
//
// PBKDF2 parameters:
//   - iterations: 100,000 (OWASP minimum recommendation as of 2023)
//   - salt: 16 random bytes (128 bits)
//   - hash: HMAC-SHA-256
//   - output: 32 bytes (256 bits)

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const LEGACY_HASH_LENGTH = 64; // SHA-256 hex length

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return arr;
}

/**
 * Hash a password using PBKDF2 with a random salt.
 * Returns: "pbkdf2$<iterations>$<salt_hex>$<hash_hex>"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    HASH_BYTES * 8
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt.buffer)}$${toHex(derived)}`;
}

/**
 * Verify a password against a stored hash.
 * Supports both legacy (plain SHA-256 hex) and new (pbkdf2$...) formats.
 * Returns true if the password matches.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !password) return false;

  // Legacy format: plain 64-char hex (SHA-256, no separator)
  if (storedHash.length === LEGACY_HASH_LENGTH && !storedHash.includes("$")) {
    const data = enc.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const legacyHash = toHex(hashBuffer);
    return constantTimeEqual(legacyHash, storedHash);
  }

  // New format: pbkdf2$<iterations>$<salt_hex>$<hash_hex>
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expectedHash = parts[3];

  if (!iterations || !salt || !expectedHash) return false;

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    HASH_BYTES * 8
  );
  const derivedHex = toHex(derived);
  return constantTimeEqual(derivedHex, expectedHash);
}

/**
 * Check if a stored hash is legacy format (needs migration).
 */
export function isLegacyHash(storedHash: string): boolean {
  if (!storedHash) return false;
  return storedHash.length === LEGACY_HASH_LENGTH && !storedHash.includes("$");
}

/**
 * Generate a cryptographically secure random password.
 * Uses crypto.getRandomValues (not Math.random).
 */
export function generateSecurePassword(length: number = 16): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

/**
 * Generate a cryptographically secure random token for password reset links.
 */
export function generateSecureToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes.buffer);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}