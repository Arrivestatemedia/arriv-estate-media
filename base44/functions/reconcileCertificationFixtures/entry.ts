import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sweepStaleCertRuns } from '../../shared/certRunCleanup.ts';

/**
 * Reconcile synthetic certification fixtures left behind by INTERRUPTED runs.
 *
 * ADMIN-ONLY. Deletes only records whose own identifier carries a synthetic marker
 * (cert_ / isolation_prod_ / prod_test_ / TEST- …) and which are older than the age
 * threshold, so a certification suite that is currently running is never disturbed and
 * no legitimate customer, employee, wallet, payment or payroll record can be touched.
 *
 * Idempotent: running it twice deletes nothing the second time.
 *
 * Body: { "olderThanMinutes": 30 }   (optional; defaults to 30)
 */
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const olderThanMinutes = typeof body?.olderThanMinutes === 'number' && body.olderThanMinutes >= 0
      ? body.olderThanMinutes
      : 30;

    const result = await sweepStaleCertRuns(base44.asServiceRole, olderThanMinutes);

    return Response.json({
      success: true,
      ...result,
      note: 'Only synthetic-marked records older than the threshold were removed. Legitimate records are never touched.',
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}