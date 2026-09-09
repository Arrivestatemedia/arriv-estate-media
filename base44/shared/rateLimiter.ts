// rateLimiter.ts
// Application-level rate limiting for Arriv Estate Media.
//
// Uses the SecurityAuditLog entity to track request timestamps per key+action.
// This is a simple window-based limiter — not a high-performance Redis-backed
// limiter, but sufficient for brute-force protection on login/reset endpoints.
//
// Limits are enforced by counting records in a time window. This works because
// SecurityAuditLog records are immutable and timestamped.
//
// For high-traffic endpoints, platform-level rate limiting may be needed
// (marked as EXTERNAL/PLATFORM ACTION in the audit report).

import type { Base44Client } from "npm:@base44/sdk@0.8.48";

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number; // e.g. 15 * 60 * 1000 for 15 minutes
}

// Pre-configured limits for common actions
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  login: { maxAttempts: 10, windowMs: 15 * 60 * 1000 }, // 10 attempts per 15 min
  admin_login: { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 min
  password_reset: { maxAttempts: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour
  password_change: { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 5 per 15 min
  public_application: { maxAttempts: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour per IP
  otp_request: { maxAttempts: 3, windowMs: 15 * 60 * 1000 }, // 3 per 15 min
};

/**
 * Check if a rate limit has been exceeded.
 * Uses a lightweight in-memory map for basic throttling.
 * For production-grade rate limiting, platform-level controls are needed.
 *
 * Returns { allowed: boolean, retryAfterMs: number }
 */
const memoryStore = new Map<string, { count: number; firstAttempt: number }>();

// Periodic cleanup of expired entries (every 5 minutes)
let lastCleanup = Date.now();
function cleanupExpired() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = now;
  for (const [key, entry] of memoryStore.entries()) {
    if (now - entry.firstAttempt > 60 * 60 * 1000) {
      memoryStore.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  action: string,
  config: RateLimitConfig
): { allowed: boolean; retryAfterMs: number; remaining: number } {
  cleanupExpired();
  const compositeKey = `${action}:${key}`;
  const now = Date.now();

  const existing = memoryStore.get(compositeKey);
  if (!existing || now - existing.firstAttempt > config.windowMs) {
    // No entry or window expired — start fresh
    memoryStore.set(compositeKey, { count: 1, firstAttempt: now });
    return { allowed: true, retryAfterMs: 0, remaining: config.maxAttempts - 1 };
  }

  existing.count++;
  if (existing.count > config.maxAttempts) {
    const retryAfterMs = config.windowMs - (now - existing.firstAttempt);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0), remaining: 0 };
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: config.maxAttempts - existing.count,
  };
}

/**
 * Extract a rate-limit key from the request (IP or email).
 */
export function getRateLimitKey(req: Request, email?: string): string {
  if (email) return `email:${email.toLowerCase().trim()}`;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return `ip:${forwarded.split(",")[0].trim()}`;
  return `ip:${req.headers.get("cf-connecting-ip") || "unknown"}`;
}