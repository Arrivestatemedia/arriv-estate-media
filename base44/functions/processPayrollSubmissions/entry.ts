import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { processPendingSubmissions } from "../../shared/payrollPeriodEngine.ts";

// Scheduled: retries failed (retryable) PayrollSubmissions and auto-sends locked
// periods when automatic_payroll_enabled is on.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const result = await processPendingSubmissions(base44);
    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});