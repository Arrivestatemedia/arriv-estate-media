import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { deliverPropertyInquiry, isDueForRetry } from "../../shared/propertyLeadDelivery.ts";

// The retry sweep for property lead delivery, run by a scheduled workflow.
//
// A lead is written to the database before any send is attempted, so this exists to finish the job
// when the first attempt (or a later one) could not reach the provider: it picks up everything that
// is still owed to a listing contact and is due, and tries again within the recorded backoff.
//
// Bounded per run (25) so a provider outage cannot turn one sweep into thousands of calls.

const BATCH = 25;

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Called by the workflow as an app administrator, and its URL is public: verify that.
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const pending = rows(
      await base44.asServiceRole.entities.PropertyInquiry.filter(
        { notification_status: { $in: ["pending_agent_delivery", "retrying"] } },
        { sort: "created_at", limit: BATCH * 2 },
      ),
    );

    const due = pending.filter((inquiry: any) => isDueForRetry(inquiry)).slice(0, BATCH);
    let delivered = 0;
    let retrying = 0;
    let failed = 0;

    for (const inquiry of due) {
      const outcome = await deliverPropertyInquiry(base44, inquiry);
      if (outcome.ok && !outcome.skipped) delivered += 1;
      else if (outcome.terminal) failed += 1;
      else if (!outcome.skipped) retrying += 1;
    }

    return Response.json({
      ok: true,
      inspected: pending.length,
      attempted: due.length,
      delivered,
      retrying,
      failed,
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
});