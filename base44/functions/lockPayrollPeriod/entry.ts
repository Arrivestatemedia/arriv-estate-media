import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { lockPeriod, resolveCurrentPayPeriod } from "../../shared/payrollPeriodEngine.ts";

// Admin: lock a pay period (current, or by pay_period_id). Builds per-employee
// snapshots, freezes eligible commission records, and marks the period locked.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { pay_period_id } = body;

    if (!pay_period_id) {
      const current = await resolveCurrentPayPeriod(base44);
      if (!current) return Response.json({ error: "Could not resolve current pay period" }, { status: 500 });
      const res = await lockPeriod(base44, current.pay_period_id);
      return Response.json(res, res.error ? { status: 400 } : undefined);
    }

    const res = await lockPeriod(base44, pay_period_id);
    return Response.json(res, res.error ? { status: 400 } : undefined);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});