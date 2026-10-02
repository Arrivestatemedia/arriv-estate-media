import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { findPartnerRecord } from '../../shared/stripeConnect.ts';
import { syncEarningRecord, buildEarningParamsFromJob } from '../../shared/mediaSpecialistEarningSync.ts';

// Backfills MediaSpecialistEarningSync records for all jobs that have been
// paid out (paid_out_at set) but don't yet have an earning sync record.
// Pushes each to Arriv Payroll for document/tax statement generation.
//
// Admin-only. One-time backfill — safe to re-run (idempotent by earning_id).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== "admin") {
      return Response.json({ error: "Admin only" }, { status: 403 });
    }

    // Find all paid jobs
    const paidJobs = await base44.asServiceRole.entities.Job.filter(
      { paid_out_at: { $exists: true } }, '-paid_out_at', 500
    );

    const results = [];
    let synced = 0;
    let failed = 0;

    for (const job of (paidJobs || [])) {
      try {
        const partnerRec = await findPartnerRecord(base44, job.booked_by);
        if (!partnerRec) {
          results.push({ job_id: job.id, title: job.title, status: "skipped", reason: "No partner record found" });
          failed++;
          continue;
        }

        const payoutDate = job.paid_out_at ? job.paid_out_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
        const params = buildEarningParamsFromJob(job, partnerRec, {
          transferId: `backfill_${job.id}`,
          payoutDate,
        });

        const r = await syncEarningRecord(base44, params);
        if (r.success) {
          synced++;
          results.push({ job_id: job.id, title: job.title, status: "synced" });
        } else {
          failed++;
          results.push({ job_id: job.id, title: job.title, status: "error", error: r.error });
        }
      } catch (e) {
        failed++;
        results.push({ job_id: job.id, title: job.title, status: "error", error: e.message });
      }
    }

    return Response.json({
      success: true,
      total: paidJobs?.length || 0,
      synced,
      failed,
      results,
    });
  } catch (error) {
    console.error('backfillMediaEarningSync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});