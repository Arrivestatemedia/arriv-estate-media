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
  /**
   * Optional body-level certification flag sent by the source application
   * (e.g. Arriv Pay sends `certification: true`). When true, this serves as
   * the intent marker IN PLACE OF a cert_-prefixed request ID header.
   *
   * This flag ALONE never authorizes financial mutations — it is only
   * accepted when combined with valid canonical HMAC, trusted source,
   * fresh timestamp, and cert_-prefixed synthetic payload identifiers.
   * Wallet-level synthetic fixture isolation is enforced separately by
   * the payment processor.
   */
  certificationFlag?: boolean;
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
  // 4. Intent marker: EITHER a cert_-prefixed request ID header OR a
  //    body-level `certification: true` flag from the source application.
  //    Neither alone is sufficient — both require valid HMAC + trusted
  //    source + fresh timestamp (steps 1-3) and synthetic payload
  //    identifiers (step 5) to qualify.
  if (!ctx.requestId && !ctx.certificationFlag) {
    return {
      isCertification: false,
      certId: null,
      reason: 'Missing request ID and certification flag',
    };
  }
  if (ctx.requestId && !isCertificationId(ctx.requestId) && !ctx.certificationFlag) {
    return {
      isCertification: false,
      certId: null,
      reason: 'Request ID must carry cert_ prefix or certification flag must be true',
    };
  }
  // 5. Synthetic cert_ prefix on ALL non-empty payload identifiers
  //    (request ID alone is NOT sufficient — payload must also be fully synthetic)
  //    Partial cert identity (some cert_, some real) must NOT qualify — a real
  //    wallet_id with a cert_ payment_event_id could otherwise bypass the feature
  //    flag and credit a production wallet.
  const nonEmptyIds = (ctx.identifiers || []).filter(
    (id) => id != null && String(id).trim() !== ''
  );
  const certIds = nonEmptyIds.filter(isCertificationId);
  if (certIds.length === 0) {
    return {
      isCertification: false,
      certId: null,
      reason: 'No cert_ prefixed synthetic payload identifier found',
    };
  }
  const nonCertIds = nonEmptyIds.filter((id) => !isCertificationId(id));
  if (nonCertIds.length > 0) {
    return {
      isCertification: false,
      certId: null,
      reason:
        'Partial cert identity — all payload identifiers must carry cert_ prefix',
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
export function isCertificationRecord(record: { source_event_id?: string; payment_event_id?: string; transaction_id?: string; customer_id?: string; customer_email?: string; lot_id?: string; organization_id?: string } | null | undefined): boolean {
  if (!record) return false;
  return isCertificationId(record.source_event_id) ||
    isCertificationId(record.payment_event_id) ||
    isCertificationId(record.transaction_id) ||
    isCertificationId(record.customer_id) ||
    isCertificationId(record.customer_email) ||
    isCertificationId(record.lot_id) ||
    isCertificationId(record.organization_id);
}

/**
 * Robust synthetic record detection for production workflow filtering.
 * Checks BOTH the certification_mode boolean field AND cert_ prefix on
 * key identifiers. Use this in production workflows to safely exclude
 * cert fixtures that may lack the certification_mode field (created by
 * older test runs) — without deleting or modifying financial history.
 */
export function isSyntheticRecord(record: {
  certification_mode?: boolean;
  source_event_id?: string;
  payment_event_id?: string;
  transaction_id?: string;
  customer_id?: string;
  customer_email?: string;
  lot_id?: string;
  organization_id?: string;
} | null | undefined): boolean {
  if (!record) return false;
  if (record.certification_mode === true) return true;
  return isCertificationRecord(record);
}