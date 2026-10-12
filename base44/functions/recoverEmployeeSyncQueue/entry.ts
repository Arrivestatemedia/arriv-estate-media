import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { ensureEmployeeId, enqueueSync, runSyncAttempt } from "../../shared/payrollEmployeeSync.ts";
import { getPayrollConfig } from "../../shared/payrollSettings.ts";
import { writeAuditLog } from "../../shared/payrollAudit.ts";

// Governed recovery of employee-sync records that failed while the Arriv Payroll
// employee-sync endpoint was unreachable (HTTP 525) or rejecting every credential (401).
//
// A record is REPLAYED only when all of the following hold:
//   * a current SalesTeamMember resolves as the employee — by ARRIV_EMPLOYEE_ID, or, when
//     that id no longer matches (a member record that was recreated is issued a new
//     immutable id), by the record's personal email;
//   * that member is a production identity: not a sample row, not inactive, a deliverable
//     mailbox, and a non-test employment status;
//   * the legal-employer mapping (payroll_company_id), the endpoint and the API credential
//     all resolve.
//
// The replay is driven from the member's CURRENT record, never from the stored snapshot.
// Every replayed employee therefore resolves to exactly one current ARRIV_EMPLOYEE_ID,
// so a superseded id cannot create a second employee at Arriv Payroll.
//
// Anything else is dispositioned rather than replayed:
//   EXCLUDED — a stale identity of a person who WAS replayed from their current record.
//   HELD     — a non-production identity, an identity with no current member record, or a
//              record whose replay was attempted and refused. Held records are marked
//              non-retryable and unscheduled, so the scheduled processor never picks them
//              up and no obsolete employee can be created later.
//
// This function writes only to EmployeeSyncQueue and to the sync-status fields of
// SalesTeamMember. It never starts a payroll run, a commission payout or billing of any
// kind, and it does not touch Auto-Fund enrollment, membership fees, pricing or wallets.

const TEST_DOMAINS = /@(test\.invalid|testcompany\.com|example\.com|cert\.test|arriv\.internal|test\.com)$/i;
const TEST_MAILBOX = /^(sample|test|testrep|demo|example|noreply|admin)([._-]|$)/i;
const TEST_STATUS = /(test|matrix|dummy|fake|sample)/i;

const norm = (v) => String(v ?? "").trim().toLowerCase();
const asArray = (r) => (Array.isArray(r) ? r : (r?.items || []));

// Identity facts that disqualify a record from ever becoming an Arriv Payroll employee.
function nonProductionReasons(member, payload) {
  const reasons = [];
  const email = norm(payload?.personal_email || member?.personal_email || member?.email);
  if (!email) {
    reasons.push("no_email_on_record");
  } else {
    if (TEST_DOMAINS.test(email)) reasons.push(`test_domain:${email.split("@")[1]}`);
    if (TEST_MAILBOX.test(email.split("@")[0])) reasons.push(`test_mailbox:${email.split("@")[0]}`);
  }
  if (member && member.is_sample === true) reasons.push("sample_record");
  if (member && member.is_active === false) reasons.push("inactive_member");
  const status = String(payload?.employment_status || member?.employment_status || "");
  if (TEST_STATUS.test(status)) reasons.push(`test_employment_status:${status}`);
  return reasons;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const apply = body.apply === true;
    const nowIso = new Date().toISOString();

    const config = await getPayrollConfig(base44);
    const employer = {
      company_id: config.company_id || null,
      endpoint: config.endpoint || null,
      credential_present: !!config.apiSecret,
      resolved: !!(config.endpoint && config.company_id && config.apiSecret),
    };

    const records = asArray(await base44.asServiceRole.entities.EmployeeSyncQueue.filter({}, "-created_date", 500));
    const members = asArray(await base44.asServiceRole.entities.SalesTeamMember.filter({}, "-created_date", 500));

    const byId = {};
    const byEmail = {};
    for (const m of members) {
      if (m.arriv_employee_id) byId[m.arriv_employee_id] = m;
      for (const e of [m.email, m.personal_email, m.company_email]) {
        if (e) byEmail[norm(e)] = byEmail[norm(e)] || m;
      }
    }
    const resolveMember = (record) =>
      byId[record.arriv_employee_id] || byEmail[norm(record.current_field_values?.personal_email)] || null;

    // ---- 1. Reconcile every record against current identity, employer and duplicates ----
    const rows = records.map((record) => {
      const payload = record.current_field_values || {};
      const member = resolveMember(record);
      const reasons = nonProductionReasons(member, payload);
      let disposition = "excluded";
      let reason = "STALE_IDENTITY_SUPERSEDED";
      let detail = "";

      if (!employer.resolved) {
        disposition = "held";
        reason = "EMPLOYER_UNRESOLVED";
        detail = "Legal-employer mapping, endpoint or credential does not resolve";
      } else if (reasons.length) {
        disposition = "held";
        reason = "NON_PRODUCTION_IDENTITY";
        detail = reasons.join(" + ");
      } else if (!member) {
        disposition = "held";
        reason = "NO_EMPLOYEE_RECORD";
        detail = "No current SalesTeamMember matches this employee id or personal email";
      } else {
        detail = `Payload identity ${record.arriv_employee_id} is not the member's current identity (current: ${member.arriv_employee_id || "not yet issued"}), so it is superseded by the authoritative replay of this employee`;
      }
      return { record, member, disposition, reason, detail };
    });

    // ---- 2. Authoritative replay set: production members behind these records ----------
    const replay = new Map();
    for (const row of rows) {
      if (row.disposition !== "excluded" || !row.member) continue;
      const key = row.member.id;
      const ts = new Date(row.record.event_timestamp || row.record.created_date).getTime();
      const entry = replay.get(key) || { member: row.member, event_type: row.record.event_type, ts: 0, record_ids: [] };
      entry.record_ids.push(row.record.id);
      if (ts >= entry.ts) {
        entry.ts = ts;
        entry.event_type = row.record.event_type;
      }
      replay.set(key, entry);
    }

    // ---- 3. Replay, then disposition every record -------------------------------------
    const synchronizedEmployees = [];
    if (apply && employer.resolved) {
      for (const entry of replay.values()) {
        try {
          const withId = await ensureEmployeeId(base44, entry.member);
          const queueRecord = await enqueueSync(base44, withId, entry.event_type, []);
          const result = await runSyncAttempt(base44, queueRecord);
          const fresh = await base44.asServiceRole.entities.SalesTeamMember.get(entry.member.id);
          entry.sync_id = queueRecord.sync_id;
          entry.outcome = result.ok === true;

          if (result.ok) {
            // Carry Arriv Payroll's acknowledgement onto the queue record as evidence.
            const ackId = fresh?.payroll_employee_id || "";
            await base44.asServiceRole.entities.EmployeeSyncQueue.update(queueRecord.id, {
              payroll_employee_id: ackId,
            });
          }
          synchronizedEmployees.push({
            member_id: entry.member.id,
            name: entry.member.full_name,
            arriv_employee_id: withId.arriv_employee_id,
            sync_id: queueRecord.sync_id,
            acknowledged: result.ok === true,
            payroll_sync_status: fresh?.payroll_sync_status || null,
            payroll_employee_id: fresh?.payroll_employee_id || null,
            payroll_sync_error: fresh?.payroll_sync_error || null,
            records_superseded: entry.record_ids.length,
          });
          await writeAuditLog(base44, {
            actor: user.email || "admin",
            action: "employee_sync_recovery_replay",
            entityType: "SalesTeamMember",
            entityId: withId.arriv_employee_id,
            afterValues: { sync_id: queueRecord.sync_id, acknowledged: result.ok === true, records_superseded: entry.record_ids.length },
            destinationApplication: "arriv_payroll",
            result: result.ok ? "success" : "failure",
          });
        } catch (err) {
          entry.outcome = false;
          synchronizedEmployees.push({
            member_id: entry.member.id,
            name: entry.member.full_name,
            acknowledged: false,
            error: err.message,
            records_superseded: entry.record_ids.length,
          });
        }
      }
    }

    // Disposition is computed for every record in both modes, so the reconciliation can be
    // reviewed in full before anything is written; only the writes are gated by `apply`.
    const dispositions = [];
    for (const row of rows) {
      const entry = row.member ? replay.get(row.member.id) : null;
      const replayed = entry?.outcome === true;
      let status = "requires_review";
      let reason = row.reason;
      let detail = row.detail;
      let finalDisposition = row.disposition;

      if (row.disposition === "excluded") {
        if (replayed) {
          status = "superseded";
          reason = "STALE_IDENTITY_SUPERSEDED";
          detail = `${detail}. Replaced by authoritative sync ${entry.sync_id}.`;
        } else if (apply) {
          finalDisposition = "held";
          reason = "REPLAY_FAILED";
          detail = `${detail}. The authoritative replay of this employee was not acknowledged by Arriv Payroll, so this stale identity was NOT replayed either.`;
        }
      }

      if (apply && employer.resolved) {
        await base44.asServiceRole.entities.EmployeeSyncQueue.update(row.record.id, {
          processing_status: status,
          hold_reason: reason,
          hold_detail: detail,
          held_at: nowIso,
          non_retryable: true,
          next_attempt_at: null,
          completed_timestamp: nowIso,
        });
      }

      dispositions.push({
        sync_id: row.record.sync_id,
        arriv_employee_id: row.record.arriv_employee_id,
        event_type: row.record.event_type,
        disposition: finalDisposition,
        status: apply && employer.resolved ? status : null,
        reason,
        detail,
      });
    }

    if (apply && employer.resolved) {
      await writeAuditLog(base44, {
        actor: user.email || "admin",
        action: "employee_sync_recovery_completed",
        entityType: "EmployeeSyncQueue",
        entityId: "recovery",
        afterValues: {
          reconciled: rows.length,
          employees_synchronized: synchronizedEmployees.filter((s) => s.acknowledged).length,
          excluded: dispositions.filter((d) => d.disposition === "excluded").length,
          held: dispositions.filter((d) => d.disposition === "held").length,
        },
        destinationApplication: "arriv_payroll",
        result: "success",
      });
    }

    const held = dispositions.filter((d) => d.disposition === "held");
    const excluded = dispositions.filter((d) => d.disposition === "excluded");
    const byReason = {};
    for (const d of dispositions) byReason[d.reason] = (byReason[d.reason] || 0) + 1;

    return Response.json({
      success: true,
      mode: apply ? "applied" : "plan",
      employer_mapping: employer,
      totals: {
        reconciled: rows.length,
        employees_synchronized: synchronizedEmployees.filter((s) => s.acknowledged).length,
        employees_attempted: synchronizedEmployees.length,
        records_excluded: excluded.length,
        records_held: held.length,
      },
      by_reason: byReason,
      synchronized: synchronizedEmployees,
      planned_replays: apply ? undefined : [...replay.values()].map((e) => ({ member_id: e.member.id, name: e.member.full_name, current_id: e.member.arriv_employee_id || null, event_type: e.event_type, records_superseded: e.record_ids.length })),
      dispositions,
      safeguards: {
        payroll_runs_triggered: 0,
        commission_payouts_triggered: 0,
        billing_triggered: 0,
        autofund_modified: false,
        writes: ["EmployeeSyncQueue", "SalesTeamMember.payroll_sync_*"],
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});