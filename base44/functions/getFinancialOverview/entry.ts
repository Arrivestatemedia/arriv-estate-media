import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getFinancialOverview
 * Returns completed/worked jobs with payout vs revenue, plus per-specialist earnings.
 * Admin-only (RLS on Job already restricts reads, but we use asServiceRole for full visibility).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Load all jobs that have been "worked":
    // - status === 'completed' (capture done + footage confirmed)
    // - OR media_partner_fulfillment_status === 'completed' (capture + upload done)
    // - OR capture_status === 'captured' (on-site capture done)
    // We fetch a generous batch and filter server-side.
    const allJobs = await base44.asServiceRole.entities.Job.list('-completed_date', 500);

    const workedJobs = allJobs.filter(j =>
      j.status === 'completed' ||
      j.media_partner_fulfillment_status === 'completed' ||
      j.capture_status === 'captured'
    );

    let totalEarned = 0;   // sum of client_price (revenue)
    let totalPaidOut = 0;   // sum of pay_rate (contractor payout)
    let totalOutstanding = 0; // earned but not yet paid out

    const specialistMap = {};

    const jobs = workedJobs.map(j => {
      const revenue = j.client_price || 0;
      const payout = j.pay_rate || 0;
      const profit = revenue - payout;
      const isPaid = !!j.paid_out_at;

      totalEarned += revenue;
      totalPaidOut += isPaid ? payout : 0;
      if (!isPaid) totalOutstanding += payout;

      const specialistKey = j.booked_by || j.booked_by_name || 'Unassigned';
      const specialistName = j.booked_by_name || 'Unassigned';
      if (!specialistMap[specialistKey]) {
        specialistMap[specialistKey] = {
          name: specialistName,
          email: j.booked_by || '',
          jobs_worked: 0,
          total_earned: 0,
          total_paid_out: 0,
          total_outstanding: 0
        };
      }
      specialistMap[specialistKey].jobs_worked += 1;
      specialistMap[specialistKey].total_earned += payout;
      if (isPaid) specialistMap[specialistKey].total_paid_out += payout;
      else specialistMap[specialistKey].total_outstanding += payout;

      return {
        id: j.id,
        title: j.title,
        location: j.location,
        date: j.date,
        status: j.status,
        specialist_name: specialistName,
        specialist_email: j.booked_by || '',
        revenue,
        payout,
        profit,
        paid_out: isPaid,
        paid_out_at: j.paid_out_at,
        completed_at: j.completed_at
      };
    });

    // Sort jobs by completed_at desc (fallback to date)
    jobs.sort((a, b) => {
      const aDate = a.completed_at || a.date || '';
      const bDate = b.completed_at || b.date || '';
      return bDate.localeCompare(aDate);
    });

    const specialistBreakdown = Object.values(specialistMap)
      .sort((a, b) => b.total_earned - a.total_earned);

    return Response.json({
      totals: {
        total_earned: totalEarned,
        total_paid_out: totalPaidOut,
        total_outstanding: totalOutstanding,
        total_profit: totalEarned - totalPaidOut,
        total_jobs: jobs.length
      },
      jobs,
      specialistBreakdown
    });
  } catch (error) {
    console.error('Error in getFinancialOverview:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});