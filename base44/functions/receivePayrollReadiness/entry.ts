import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { verifyReadinessMessage, applyReadinessEvent, writeOrientationAudit, READINESS_EVENTS } from "../../shared/salesOrientationEngine.ts";

// Inbound webhook from Arriv Payroll: signed payroll-readiness status updates.
// Verifies HMAC SHA-256 + timestamp freshness + request/event-id dedup +
// employee-id match. Never accepts tax answers — only safe statuses.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const rawBody = await req.text();
    const webhookSecret = Deno.env.get("ARRIV_PAYROLL_WEBHOOK_SECRET") || "";
    if (!webhookSecret) return Response.json({ error: "Webhook secret not configured" }, { status: 500 });

    let data;
    try { data = JSON.parse(rawBody); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

    const signature = req.headers.get("X-Arriv-Signature") || "";
    const timestamp = req.headers.get("X-Arriv-Timestamp") || "";
    const requestId = req.headers.get("X-Arriv-Request-Id") || data?.request_id || "";
    const sourceAppId = req.headers.get("X-Arriv-Source-App") || data?.source_application_id || "arriv_payroll";
    const employeeId = req.headers.get("X-Arriv-Employee-Id") || data?.arriv_employee_id || "";
    const eventId = data?.event_id || "";

    if (!employeeId || !eventId) return Response.json({ error: "arriv_employee_id and event_id are required" }, { status: 400 });

    const verify = await verifyReadinessMessage(webhookSecret, {
      rawBody, signature, timestamp, requestId, sourceAppId, employeeId, eventId,
    });
    if (!verify.ok) return Response.json({ error: `Rejected: ${verify.reason}` }, { status: 401 });

    const eventType = data.event_type;
    if (!Object.values(READINESS_EVENTS).includes(eventType)) {
      return Response.json({ error: `Unknown event_type: ${eventType}` }, { status: 400 });
    }

    // Dedup by event_id and request_id.
    const dupEvent = await base44.asServiceRole.entities.PayrollReadinessEvent.filter({ event_id: eventId });
    if (dupEvent && dupEvent.length) return Response.json({ skipped: true, reason: "duplicate event_id" });
    if (requestId) {
      const dupReq = await base44.asServiceRole.entities.PayrollReadinessEvent.filter({ request_id: requestId });
      if (dupReq && dupReq.length) return Response.json({ skipped: true, reason: "duplicate request_id" });
    }

    // Employee-id match: the employee must have an orientation in Arriv One.
    const orientRows = await base44.asServiceRole.entities.SalesOrientation.filter({ arriv_employee_id: employeeId });
    const orientation = orientRows && orientRows[0];
    if (!orientation) {
      await base44.asServiceRole.entities.PayrollReadinessEvent.create({
        event_id: eventId, request_id: requestId, arriv_employee_id: employeeId,
        event_type: eventType, payload: data, received_at: new Date().toISOString(),
        processed: false, source_application: sourceAppId,
      });
      return Response.json({ error: "Employee not found in Arriv One" }, { status: 404 });
    }

    const evt = { event_type: eventType, payload: data?.payload || {} };
    await applyReadinessEvent(base44, orientation, evt);

    await base44.asServiceRole.entities.PayrollReadinessEvent.create({
      event_id: eventId, request_id: requestId, arriv_employee_id: employeeId,
      event_type: eventType, payload: data?.payload || {}, received_at: new Date().toISOString(),
      processed: true, source_application: sourceAppId,
    });

    await writeOrientationAudit(base44, {
      arrivEmployeeId: employeeId,
      actor: sourceAppId,
      role: "system",
      action: `readiness:${eventType}`,
      section: "payroll_readiness",
      affectedRecord: orientation.orientation_id,
      requestId,
      sourceApplication: sourceAppId,
    });

    return Response.json({ success: true, event_type: eventType });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});