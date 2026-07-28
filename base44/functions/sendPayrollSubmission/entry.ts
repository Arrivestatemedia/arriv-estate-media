import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { sendSubmission, resolveCurrentPayPeriod } from "../../shared/payrollPeriodEngine.ts";

// Admin: submit a locked pay period to Arriv Payroll (signed, idempotent, retryable).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    let { pay_period_id } = body;
    if (!pay_period_id) {
      const current = await resolveCurrentPayPeriod(base44);
      if (!current) return Response.json({ error: "Could not resolve current pay period" }, { status: 500 });
      pay_period_id = current.pay_period_id;
    }

    const res = await sendSubmission(base44, pay_period_id);
    return Response.json(res, res.error ? { status: 502 } : undefined);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});