import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { verifyPassword, hashPassword, isLegacyHash, generateSecurePassword, generateSecureToken } from '../../shared/passwordKdf.ts';
import { checkRateLimit, RATE_LIMITS } from '../../shared/rateLimiter.ts';

/**
 * Security Regression Test — Arriv Estate Media Round 2 Remediation
 *
 * This function runs automated tests verifying that the security remediations
 * are correctly implemented. It should be run after any security-relevant
 * change to catch regressions.
 *
 * Admin-only: requires an authenticated admin user.
 *
 * Tests:
 *   1. PBKDF2 password hashing (hash + verify round-trip)
 *   2. Legacy SHA-256 hash detection and migration
 *   3. Constant-time comparison (wrong password rejected)
 *   4. Secure token generation (sufficient entropy)
 *   5. Rate limiter (blocks after threshold)
 *   6. RLS configuration presence on critical entities
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    // Admin gate
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const results: Array<{ test: string; passed: boolean; detail: string }> = [];

    // ── Test 1: PBKDF2 password hashing round-trip ──
    try {
      const testPassword = 'TestP@ssw0rd!123';
      const hashed = await hashPassword(testPassword);
      const verified = await verifyPassword(testPassword, hashed);
      const formatOk = hashed.startsWith('pbkdf2$100000$');
      results.push({
        test: 'PBKDF2 hash + verify round-trip',
        passed: verified && formatOk,
        detail: formatOk ? `Hash format: ${hashed.split('$')[0]}$${hashed.split('$')[1]}$...` : 'Invalid hash format',
      });
    } catch (e) {
      results.push({ test: 'PBKDF2 hash + verify round-trip', passed: false, detail: (e as Error).message });
    }

    // ── Test 2: Legacy hash detection ──
    try {
      const legacyHash = 'a'.repeat(64); // Simulated SHA-256 hex
      const newHash = 'pbkdf2$100000$abcdef$123456';
      const legacyDetected = isLegacyHash(legacyHash);
      const newNotLegacy = !isLegacyHash(newHash);
      results.push({
        test: 'Legacy SHA-256 hash detection',
        passed: legacyDetected && newNotLegacy,
        detail: `Legacy detected: ${legacyDetected}, New not legacy: ${newNotLegacy}`,
      });
    } catch (e) {
      results.push({ test: 'Legacy SHA-256 hash detection', passed: false, detail: (e as Error).message });
    }

    // ── Test 3: Wrong password rejected ──
    try {
      const hashed = await hashPassword('correctPassword');
      const wrongResult = await verifyPassword('wrongPassword', hashed);
      results.push({
        test: 'Wrong password rejected',
        passed: !wrongResult,
        detail: wrongResult ? 'FAIL: wrong password was accepted' : 'Correctly rejected',
      });
    } catch (e) {
      results.push({ test: 'Wrong password rejected', passed: false, detail: (e as Error).message });
    }

    // ── Test 4: Secure token entropy ──
    try {
      const token = generateSecureToken();
      const password = generateSecurePassword(16);
      const tokenLenOk = token.length === 64; // 32 bytes hex = 64 chars
      const pwLenOk = password.length === 16;
      const pwNoAmbiguous = !/[O0Il1S5B8G6]/.test(password); // ambiguous chars excluded
      results.push({
        test: 'Secure token/password generation',
        passed: tokenLenOk && pwLenOk && pwNoAmbiguous,
        detail: `Token length: ${token.length}, Password length: ${password.length}, No ambiguous chars: ${pwNoAmbiguous}`,
      });
    } catch (e) {
      results.push({ test: 'Secure token/password generation', passed: false, detail: (e as Error).message });
    }

    // ── Test 5: Rate limiter blocks after threshold ──
    try {
      const testKey = `test:${Date.now()}`;
      const config = { maxAttempts: 3, windowMs: 60000 };
      let blocked = false;
      let attempts = 0;
      for (let i = 0; i < 5; i++) {
        const rl = checkRateLimit(testKey, 'security_test', config);
        attempts++;
        if (!rl.allowed) {
          blocked = true;
          break;
        }
      }
      results.push({
        test: 'Rate limiter blocks after threshold',
        passed: blocked && attempts === 4, // Should block on 4th attempt (after 3 allowed)
        detail: `Blocked after ${attempts} attempts (expected: 4)`,
      });
    } catch (e) {
      results.push({ test: 'Rate limiter blocks after threshold', passed: false, detail: (e as Error).message });
    }

    // ── Test 6: RLS configuration presence on critical entities ──
    try {
      const criticalEntities = [
        'Contact', 'ActivityLog', 'Deal', 'Commission', 'Invoice',
        'JobApplication', 'SalesTeamMember', 'Booking', 'Job',
        'ChatMessage', 'ProspectBrief', 'SecurityAuditLog',
      ];
      const schemaResults: string[] = [];
      for (const entityName of criticalEntities) {
        try {
          const schema = await (base44.asServiceRole.entities as any)[entityName].schema();
          if (schema?.rls && Object.keys(schema.rls).length > 0) {
            schemaResults.push(`${entityName}: OK`);
          } else {
            schemaResults.push(`${entityName}: MISSING RLS`);
          }
        } catch (e) {
          schemaResults.push(`${entityName}: ERROR - ${(e as Error).message}`);
        }
      }
      const allHaveRls = schemaResults.every(r => r.includes(': OK'));
      results.push({
        test: 'RLS on critical entities',
        passed: allHaveRls,
        detail: schemaResults.join('; '),
      });
    } catch (e) {
      results.push({ test: 'RLS on critical entities', passed: false, detail: (e as Error).message });
    }

    // ── Summary ──
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const allPassed = passed === total;

    return Response.json({
      success: true,
      all_passed: allPassed,
      passed,
      total,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Security regression test error:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});