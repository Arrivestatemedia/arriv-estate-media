import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { promoteEligibleRecords, backfillSourceRecords } from "../../shared/commissionSourceEngine.ts";

// Scheduled: promotes cleared CommissionSourceRecords to "eligible" (feeding
// PayrollPeriod in phase 4) and backfills any missing records for paid invoices.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const promoted = await promoteEligibleRecords(base44);
    const backfilled = await backfillSourceRecords(base44);
    return Response.json({
      success: true,
      promoted_to_eligible: promoted.length,
      promoted_ids: promoted,
      backfilled: backfilled,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});