import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { signPayload } from "../../shared/payrollCrypto.ts";
import { getPayrollConfig, setPayrollSetting } from "../../shared/payrollSettings.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { commission_id } = body;
    if (!commission_id) return Response.json({ error: "commission_id is required" }, { status: 400 });

    const config = await getPayrollConfig(base44);
    if (!config.enabled) return Response.json({ error: "Payroll integration is disabled" }, { status: 400 });
    if (!config.endpoint) return Response.json({ error: "Arriv Payroll API endpoint is not configured" }, { status: 400 });
    if (!config.apiSecret) return Response.json({ error: "Arriv Payroll API secret is not configured" }, { status: 500 });

    const commission = await base44.asServiceRole.entities.Commission.get(commission_id);
    if (!commission) return Response.json({ error: "Commission not found" }, { status: 404 });

    if (commission.approval_status !== "owner_approved") {
      return Response.json({ error: "Only owner-approved compensation may be sent to payroll" }, { status: 400 });
    }

    // Idempotency: never send a second time if already accepted / scheduled / processed / paid
    if (["accepted", "scheduled", "processed", "paid"].includes(commission.payroll_status)) {
      return Response.json(
        {
          error: "Compensation already accepted by payroll",
          payroll_status: commission.payroll_status,
          compensation_import_id: commission.payroll_compensation_import_id,
        },
        { status: 409 }
      );
    }

    // Mark as sending in progress
    await base44.asServiceRole.entities.Commission.update(commission_id, {
      payroll_status: "sending",
      payroll_sync_error: "",
    });

    const version = commission.compensation_version || 1;
    const idempotencyKey = `${commission_id}-v${version}`;

    const payload = {
      source_app: "Arriv One",
      source_record_id: commission_id,
      employee_id: commission.employee_id,
      payroll_employee_id: commission.payroll_employee_id || "",
      company_id: config.company_id,
      compensation_type: commission.compensation_type,
      commission_plan_id: commission.commission_plan_id || "",
      deal_id: commission.deal_id || "",
      customer_id: commission.customer_id || "",
      description: commission.description || "",
      gross_amount: commission.gross_amount,
      earned_date: commission.earned_date,
      approved_date: commission.approved_date,
      intended_pay_period: commission.intended_pay_period || "",
      idempotency_key: idempotencyKey,
    };

    const bodyStr = JSON.stringify(payload);
    const signature = await signPayload(config.apiSecret, bodyStr);

    const base = config.endpoint.replace(/\/functions\/.*$/i, "").replace(/\/$/, "");
    const url = base + "/functions/receiveCompensation";

    let resp;
    let respData;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Arriv-Signature": signature,
          "X-Arriv-Source": "arriv-one",
        },
        body: bodyStr,
      });
      respData = await resp.json().catch(() => ({}));
    } catch (err) {
      // Payroll unavailable: keep owner-approved, record error, allow retry, never duplicate
      await base44.asServiceRole.entities.Commission.update(commission_id, {
        payroll_status: "failed",
        payroll_sync_error: `Payroll unreachable: ${err.message}`,
        payroll_last_synced_at: new Date().toISOString(),
        payroll_response: { error: err.message },
      });
      await setPayrollSetting(base44, "payroll_last_sync_error", `Payroll unreachable: ${err.message}`);
      return Response.json({ error: "Payroll unreachable", details: err.message }, { status: 502 });
    }

    if (resp.ok && respData && respData.success) {
      const status = respData.status === "accepted" ? "accepted" : respData.status || "accepted";
      const update = {
        payroll_status: status,
        payroll_compensation_import_id: respData.compensation_import_id || "",
        payroll_pay_period_id: respData.pay_period_id || commission.payroll_pay_period_id || "",
        payroll_last_synced_at: new Date().toISOString(),
        payroll_sync_error: "",
        payroll_response: respData,
        idempotency_key: idempotencyKey,
      };
      await base44.asServiceRole.entities.Commission.update(commission_id, update);
      await setPayrollSetting(base44, "payroll_last_sync_at", new Date().toISOString());
      await setPayrollSetting(base44, "payroll_last_sync_error", "");
      return Response.json({ success: true, commission_id, ...update });
    }

    // Payroll rejected the payload — record validation errors, do not mark sent/paid
    const errMsg =
      (respData && (respData.error || respData.message)) ||
      (respData && respData.validation_errors ? JSON.stringify(respData.validation_errors) : "") ||
      `Payroll rejected with status ${resp.status}`;
    await base44.asServiceRole.entities.Commission.update(commission_id, {
      payroll_status: "rejected",
      payroll_sync_error: errMsg,
      payroll_last_synced_at: new Date().toISOString(),
      payroll_response: respData || { status: resp.status },
    });
    await setPayrollSetting(base44, "payroll_last_sync_error", errMsg);
    return Response.json({ error: errMsg, details: respData }, { status: 502 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});