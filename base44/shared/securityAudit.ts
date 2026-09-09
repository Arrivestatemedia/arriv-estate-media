// securityAudit.ts
// Canonical security audit logging for Arriv Estate Media.
// Records security-relevant events to the SecurityAuditLog entity.
//
// NEVER log: secrets, passwords, password hashes, OTPs, tokens, or full payloads.
// Only log: actor identity, action, target, result, and high-level reason codes.

import type { Base44Client } from "npm:@base44/sdk@0.8.48";

export interface AuditEvent {
  event_type: string;
  actor_id?: string;
  actor_email?: string;
  actor_role?: string;
  actor_type: "platform_user" | "sales_team_member" | "anonymous" | "system" | "webhook" | "integration";
  action: string;
  target_type?: string;
  target_id?: string;
  result: "success" | "failure" | "denied" | "error";
  reason?: string;
  ip_hash?: string;
  user_agent?: string;
  metadata?: Record<string, string>;
}

/**
 * Hash an IP address for privacy-preserving audit logging.
 * Uses a static salt so the same IP always produces the same hash
 * (for correlation) without storing the raw IP.
 */
export async function hashIp(ip: string): Promise<string> {
  if (!ip) return "";
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(`aem-audit-salt-${ip}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Truncate user agent to prevent oversized audit records.
 */
function truncateUserAgent(ua: string): string {
  if (!ua) return "";
  return ua.substring(0, 200);
}

/**
 * Extract the client IP from request headers (best-effort).
 */
function extractIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || "";
}

/**
 * Record a security audit event. Fire-and-forget (never blocks the caller).
 * Uses asServiceRole so audit logging works even for unauthenticated callers.
 */
export async function auditLog(
  base44: any,
  req: Request | null,
  event: AuditEvent
): Promise<void> {
  try {
    const ip = req ? extractIp(req) : "";
    const ipHash = ip ? await hashIp(ip) : "";
    const ua = req ? truncateUserAgent(req.headers.get("user-agent") || "") : "";

    await base44.asServiceRole.entities.SecurityAuditLog.create({
      tenant_id: "tnt_estate_media",
      event_type: event.event_type,
      actor_id: event.actor_id || "",
      actor_email: event.actor_email || "",
      actor_role: event.actor_role || "",
      actor_type: event.actor_type,
      action: event.action,
      target_type: event.target_type || "",
      target_id: event.target_id || "",
      result: event.result,
      reason: (event.reason || "").substring(0, 500),
      ip_hash: ipHash,
      user_agent: ua,
      metadata: event.metadata || {},
    });
  } catch (e) {
    // Audit logging must never break the calling function.
    console.error("auditLog failed:", (e as Error).message);
  }
}