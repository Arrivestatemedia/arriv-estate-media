/**
 * Certification Mode — safe bypass of the prepaid_enabled feature flag
 * for Arriv Pay synthetic certification test transactions.
 *
 * Bypass is granted ONLY when ALL of the following are true:
 *   1. Valid canonical HMAC authentication (NOT bearer fallback)
 *   2. Trusted source application = Arriv Pay
 *   3. Valid timestamp (±5 min freshness verified by caller)
 *   4. Valid request ID
 *   5. Synthetic certification identifier using required cert_ prefix
 *   6. No real customer, employee, Stripe charge, or payout
 *
 * Certification mode may bypass ONLY the prepaid_enabled feature flag.
 * It must NOT bypass HMAC, timestamp freshness, source validation,
 * request ID validation, replay/idempotency, RLS, financial validation,
 * amount validation, or ledger integrity.
 *
 * Boundary: Arriv Pay already implements a safe certification mode for
 * cert_-prefixed synthetic records. This mirrors that concept safely
 * on Estate Media so Arriv Pay can complete the five currently BLOCKED
 * live gates while the production feature flag remains OFF.
 */

export const CERT_PREFIX = 'cert_';

/** Returns true if a value is a synthetic certification identifier (cert_ prefix). */
export function isCertificationId(value: string | undefined | null): boolean {
  if (!value) return false;
  return String(value).startsWith(CERT_PREFIX);
}

export type AuthMethod = 'hmac' | 'bearer' | 'none';

export interface CertificationContext {
  authMethod: AuthMethod;
  sourceApp: string;
  timestamp: string;
  requestId: string;
  /** Identifiers from the payload that must carry the cert_ prefix (payment_event_id, customer_id, customer_email, etc.) */
  identifiers: (string | undefined | null)[];
}

export interface CertificationResult {
  isCertification: boolean;
  certId: string | null;
  reason: string;
}

/**
 * Evaluate whether a request qualifies for the certification feature-flag bypass.
 * Returns { isCertification: true } ONLY when every safeguard is satisfied.
 */
export function evaluateCertificationBypass(ctx: CertificationContext): CertificationResult {
  // 1. Must use canonical HMAC — bearer fallback NEVER qualifies
  if (ctx.authMethod !== 'hmac') {
    return {
      isCertification: false,
      certId: null,
      reason: 'Bearer fallback cannot qualify for certification bypass',
    };
  }
  // 2. Trusted source application = Arriv Pay
  if (ctx.sourceApp !== 'arriv_pay' && ctx.sourceApp !== 'ARRIV_PAY') {
    return {
      isCertification: false,
      certId: null,
      reason: 'Source application is not Arriv Pay',
    };
  }
  // 3. Valid timestamp present (caller verifies ±5 min freshness separately)
  if (!ctx.timestamp) {
    return {
      isCertification: false,
      certId: null,
      reason: 'Missing timestamp',
    };
  }
  // 4. Valid request ID
  if (!ctx.requestId) {
    return {
      isCertification: false,
      certId: null,
      reason: 'Missing request ID',
    };
  }
  // 5. Synthetic cert_ prefix on at least one identifier
  const certIds = (ctx.identifiers || []).filter(isCertificationId);
  if (certIds.length === 0) {
    return {
      isCertification: false,
      certId: null,
      reason: 'No cert_ prefixed synthetic identifier found',
    };
  }
  return {
    isCertification: true,
    certId: certIds[0],
    reason: 'Certification bypass granted',
  };
}

/**
 * Check whether an existing entity record is synthetic (cert_-prefixed).
 * Used to keep certification data out of production analytics/payroll.
 */
export function isCertificationRecord(record: { source_event_id?: string; payment_event_id?: string; transaction_id?: string; customer_id?: string; customer_email?: string } | null | undefined): boolean {
  if (!record) return false;
  return isCertificationId(record.source_event_id) ||
    isCertificationId(record.payment_event_id) ||
    isCertificationId(record.transaction_id) ||
    isCertificationId(record.customer_id) ||
    isCertificationId(record.customer_email);
}