// Payroll period engine: biweekly PayrollPeriod lifecycle, per-employee immutable
// snapshots + checksums, and the signed PayrollSubmission to Arriv Payroll with
// idempotency and exponential-backoff retries.

import { getPayrollConfig, getPayrollSettingValue } from "./payrollSettings.ts";
import {
  signRequest,
  generateRequestId,
  sha256Hex,
  isNonRetryableError,
  backoffDelayMs,
} from "./payrollCrypto.ts";
import { writeAuditLog } from "./payrollAudit.ts";

const PERIOD_LENGTH_DAYS = 14;
const PAYMENT_LAG_DAYS = 7;

function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function isoDate(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

// Find or create the biweekly PayrollPeriod containing `now`.
export async function resolveCurrentPayPeriod(base44, now = new Date()) {
  const anchorStr = await getPayrollSettingValue(base44, "payroll_period_anchor_date", "2026-07-25");
  const anchor = new Date(anchorStr + "T00:00:00Z");
  if (isNaN(anchor.getTime())) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayMs = 86400000;
  const idx = Math.floor((today.getTime() - anchor.getTime()) / (PERIOD_LENGTH_DAYS * dayMs));
  const start = new Date(anchor.getTime() + idx * PERIOD_LENGTH_DAYS * dayMs);
  const end = new Date(start.getTime() + (PERIOD_LENGTH_DAYS - 1) * dayMs);
  const payPeriodId = `pp_${isoDate(start)}`;
  const existing = await base44.asServiceRole.entities.PayrollPeriod.filter({ pay_period_id: payPeriodId });
  if (existing && existing.length) return existing[0];
  const cutoff = new Date(end.getTime() + 23 * 3600000 + 59 * 60000 + 59000);
  const payment = new Date(end.getTime() + PAYMENT_LAG_DAYS * dayMs);
  return base44.asServiceRole.entities.PayrollPeriod.create({
    pay_period_id: payPeriodId,
    period_start_date: isoDate(start),
    period_end_date: isoDate(end),
    commission_cutoff_at: cutoff.toISOString(),
    validation_date: isoDate(end),
    scheduled_payment_date: isoDate(payment),
    status: "collecting",
    version: 1,
  });
}

export async function getEligibleRecordsForPeriod(base44, period) {
  return base44.asServiceRole.entities.CommissionSourceRecord.filter({
    payroll_inclusion_status: "eligible",
    eligibility_date: { $gte: period.period_start_date, $lte: period.period_end_date },
  }, "-created_timestamp", 1000);
}

// Build per-employee immutable snapshots for a period from eligible records.
export async function buildSnapshotsForPeriod(base44, period, records) {
  const byEmployee = new Map();
  for (const r of records || []) {
    if (!byEmployee.has(r.arriv_employee_id)) byEmployee.set(r.arriv_employee_id, []);
    byEmployee.get(r.arriv_employee_id).push(r);
  }

  const adjByEmp = new Map();
  const adjustments = await base44.asServiceRole.entities.CommissionAdjustment.filter({
    pay_period_id: period.pay_period_id,
    status: { $in: ["approved", "included"] },
  });
  for (const a of adjustments || []) {
    if (!adjByEmp.has(a.arriv_employee_id)) adjByEmp.set(a.arriv_employee_id, []);
    adjByEmp.get(a.arriv_employee_id).push(a);
  }

  const snapshots = [];
  let companyGross = 0;
  let totalSourceRecords = 0;

  for (const [empId, recs] of byEmployee.entries()) {
    const sourceIds = recs.map((r) => r.source_record_id);
    const amounts = recs.map((r) => +(r.commissionable_amount || 0));
    const rates = recs.map((r) => +(r.commission_rate || 0));
    const empAdj = adjByEmp.get(empId) || [];
    const adjustmentIds = empAdj.map((a) => a.adjustment_id);
    const adjSum = empAdj.reduce((s, a) => s + (a.amount || 0), 0);
    const baseGross = recs.reduce((s, r) => s + (r.calculated_commission_amount || 0), 0);
    const gross = +(baseGross + adjSum).toFixed(2);
    totalSourceRecords += recs.length;
    companyGross += gross;

    const canonical = stableStringify({
      pay_period_id: period.pay_period_id,
      payroll_version: period.version,
      arriv_employee_id: empId,
      commission_source_record_ids: sourceIds,
      commissionable_amounts: amounts,
      commission_rates: rates,
      adjustment_ids: adjustmentIds,
      employee_gross_commission: gross,
    });
    const checksum = await sha256Hex(canonical);

    const snap = await base44.asServiceRole.entities.PayrollPeriodSnapshot.create({
      snapshot_id: `snap_${crypto.randomUUID()}`,
      pay_period_id: period.pay_period_id,
      payroll_version: period.version,
      arriv_employee_id: empId,
      commission_source_record_ids: sourceIds,
      commission_plan_id: recs[0]?.commission_plan_id || "",
      commission_plan_version: recs[0]?.commission_plan_version || 0,
      commissionable_amounts: amounts,
      commission_rates: rates,
      adjustment_ids: adjustmentIds,
      employee_gross_commission: gross,
      company_gross_commission_total: 0,
      source_record_count: recs.length,
      snapshot_checksum: checksum,
      created_timestamp: new Date().toISOString(),
    });
    snapshots.push(snap);
  }

  companyGross = +companyGross.toFixed(2);
  for (const s of snapshots) {
    await base44.asServiceRole.entities.PayrollPeriodSnapshot.update(s.id, {
      company_gross_commission_total: companyGross,
    });
    s.company_gross_commission_total = companyGross;
  }
  const aggregateChecksum = await sha256Hex(snapshots.map((s) => s.snapshot_checksum).sort().join("\n"));
  return {
    snapshots,
    companyGross,
    totalSourceRecords,
    employeeCount: snapshots.length,
    aggregateChecksum,
  };
}

const LOCKABLE_FROM = ["collecting", "cutoff_reached", "preparing", "ready_to_lock", "reopened_by_owner", "correction_required"];

// Lock a pay period: build snapshots, freeze eligible records, mark period locked.
export async function lockPeriod(base44, payPeriodId) {
  const period = payPeriodId
    ? (await base44.asServiceRole.entities.PayrollPeriod.filter({ pay_period_id: payPeriodId }))[0]
    : await resolveCurrentPayPeriod(base44);
  if (!period) return { error: "Pay period not found" };
  if (!LOCKABLE_FROM.includes(period.status)) {
    return { skipped: true, reason: `period status is ${period.status}`, period };
  }

  const records = await getEligibleRecordsForPeriod(base44, period);
  if (!records || !records.length) return { error: "No eligible commission records to lock" };

  const { snapshots, companyGross, totalSourceRecords, employeeCount, aggregateChecksum } =
    await buildSnapshotsForPeriod(base44, period, records);

  const now = new Date().toISOString();
  for (const r of records) {
    await base44.asServiceRole.entities.CommissionSourceRecord.update(r.id, {
      payroll_inclusion_status: "locked",
      previous_payroll_inclusion_status: "eligible",
      payroll_period_id: period.pay_period_id,
      modified_timestamp: now,
    });
  }

  const automaticEnabled =
    (await getPayrollSettingValue(base44, "automatic_payroll_enabled", "false")) === "true";
  await base44.asServiceRole.entities.PayrollPeriod.update(period.id, {
    status: "locked",
    locked_at: now,
    source_record_count: totalSourceRecords,
    employee_count: employeeCount,
    expected_gross_commission_total: companyGross,
    automatic_payroll_enabled: automaticEnabled,
  });

  await writeAuditLog(base44, {
    actor: "admin",
    action: "pay_period_locked",
    entityType: "PayrollPeriod",
    entityId: period.id,
    afterValues: {
      pay_period_id: period.pay_period_id,
      source_record_count: totalSourceRecords,
      employee_count: employeeCount,
      expected_gross_commission_total: companyGross,
      snapshot_checksum: aggregateChecksum,
    },
    destinationApplication: "arriv_payroll",
    result: "success",
  });

  return {
    success: true,
    pay_period_id: period.pay_period_id,
    locked_at: now,
    source_record_count: totalSourceRecords,
    employee_count: employeeCount,
    expected_gross_commission_total: companyGross,
    snapshot_checksum: aggregateChecksum,
  };
}

async function markSubmissionFailed(base44, submission, responseCode, responseMessage, nonRetryable) {
  const attemptNum = submission.attempt_count || 1;
  const max = submission.max_attempts || 5;
  const terminal = nonRetryable || attemptNum >= max;
  const update = {
    status: terminal ? (nonRetryable ? "requires_review" : "failed") : "failed",
    non_retryable: nonRetryable,
    response_code: String(responseCode || ""),
    response_message: String(responseMessage || ""),
    last_attempt_at: new Date().toISOString(),
  };
  if (!terminal) update.next_attempt_at = new Date(Date.now() + backoffDelayMs(attemptNum)).toISOString();
  else update.completed_at = new Date().toISOString();
  await base44.asServiceRole.entities.PayrollSubmission.update(submission.id, update);
}

// Send a locked period to Arriv Payroll. Idempotent on an accepted prior submission.
export async function sendSubmission(base44, payPeriodId) {
  const period = (await base44.asServiceRole.entities.PayrollPeriod.filter({ pay_period_id: payPeriodId }))[0];
  if (!period) return { error: "Pay period not found" };
  if (!["locked", "submitted_to_payroll", "payroll_rejected", "failed"].includes(period.status)) {
    return { error: "Period must be locked before submission", status: period.status };
  }

  const config = await getPayrollConfig(base44);
  if (!config.endpoint) return { error: "Arriv Payroll API endpoint not configured" };
  if (!config.apiSecret) return { error: "Arriv Payroll API secret not configured" };

  const snapshots = await base44.asServiceRole.entities.PayrollPeriodSnapshot.filter({
    pay_period_id: period.pay_period_id,
    payroll_version: period.version,
  });
  if (!snapshots || !snapshots.length) return { error: "No snapshots for period — lock first" };

  const prior = await base44.asServiceRole.entities.PayrollSubmission.filter({
    pay_period_id: period.pay_period_id,
    payroll_version: period.version,
  });
  if (prior && prior.some((s) => s.status === "accepted")) {
    return { skipped: true, reason: "already accepted" };
  }

  const sourceRecords = await base44.asServiceRole.entities.CommissionSourceRecord.filter({
    payroll_period_id: period.pay_period_id,
    payroll_inclusion_status: "locked",
  });

  const employeeBlock = snapshots.map((s) => ({
    arriv_employee_id: s.arriv_employee_id,
    employee_gross_commission: s.employee_gross_commission,
    commission_plan_id: s.commission_plan_id,
    commission_plan_version: s.commission_plan_version,
    source_record_count: s.source_record_count,
    source_record_ids: s.commission_source_record_ids,
    commissionable_amounts: s.commissionable_amounts,
    commission_rates: s.commission_rates,
    adjustment_ids: s.adjustment_ids || [],
    snapshot_checksum: s.snapshot_checksum,
  }));
  const submittedGross = +snapshots.reduce((sum, s) => sum + (s.employee_gross_commission || 0), 0).toFixed(2);
  const aggregateChecksum = await sha256Hex(snapshots.map((s) => s.snapshot_checksum).sort().join("\n"));

  const requestId = generateRequestId();
  const sourceAppId = "arriv-one";
  const payrollVersion = period.version;
  const payload = {
    company_id: config.company_id,
    pay_period_id: period.pay_period_id,
    payroll_version: payrollVersion,
    request_id: requestId,
    source_application_id: sourceAppId,
    commission_cutoff_at: period.commission_cutoff_at,
    scheduled_payment_date: period.scheduled_payment_date,
    submitted_gross_total: submittedGross,
    source_record_count: sourceRecords.length,
    employee_count: snapshots.length,
    snapshot_checksum: aggregateChecksum,
    employees: employeeBlock,
  };
  const bodyStr = JSON.stringify(payload);
  const now = new Date().toISOString();
  const signature = await signRequest(config.apiSecret, {
    body: bodyStr,
    timestamp: now,
    requestId,
    sourceAppId,
    employeeVersion: payrollVersion,
  });
  const base = config.endpoint.replace(/\/functions\/.*$/i, "").replace(/\/$/, "");
  const url = base + "/functions/receivePayroll";

  const existing = prior && prior.find((s) => !["accepted", "rejected", "failed", "requires_review"].includes(s.status));
  let submission;
  if (existing) {
    submission = await base44.asServiceRole.entities.PayrollSubmission.update(existing.id, {
      status: "submitted",
      request_id: requestId,
      submission_payload: payload,
      submitted_gross_total: submittedGross,
      source_record_count: sourceRecords.length,
      employee_count: snapshots.length,
      snapshot_checksum: aggregateChecksum,
      last_attempt_at: now,
      attempt_count: (existing.attempt_count || 0) + 1,
      next_attempt_at: null,
    });
  } else {
    submission = await base44.asServiceRole.entities.PayrollSubmission.create({
      submission_id: `ps_${crypto.randomUUID()}`,
      pay_period_id: period.pay_period_id,
      payroll_version: payrollVersion,
      request_id: requestId,
      source_application_id: sourceAppId,
      submitted_gross_total: submittedGross,
      source_record_count: sourceRecords.length,
      employee_count: snapshots.length,
      snapshot_checksum: aggregateChecksum,
      submission_payload: payload,
      status: "submitted",
      attempt_count: 1,
      max_attempts: 5,
      last_attempt_at: now,
      submitted_at: now,
    });
  }

  await base44.asServiceRole.entities.PayrollPeriod.update(period.id, {
    status: "submitted_to_payroll",
    submitted_at: now,
  });
  for (const r of sourceRecords) {
    await base44.asServiceRole.entities.CommissionSourceRecord.update(r.id, {
      payroll_inclusion_status: "submitted",
      modified_timestamp: now,
    });
  }

  let resp;
  let respData;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arriv-Signature": signature,
        "X-Arriv-Timestamp": now,
        "X-Arriv-Request-Id": requestId,
        "X-Arriv-Source-App": sourceAppId,
        "X-Arriv-Payroll-Version": String(payrollVersion),
      },
      body: bodyStr,
    });
    respData = await resp.json().catch(() => ({}));
  } catch (err) {
    await markSubmissionFailed(base44, submission, null, `Payroll unreachable: ${err.message}`, false);
    await base44.asServiceRole.entities.PayrollPeriod.update(period.id, { status: "failed" });
    await writeAuditLog(base44, {
      actor: "system",
      action: "payroll_submission_network_error",
      entityType: "PayrollSubmission",
      entityId: submission.id,
      requestId,
      destinationApplication: "arriv_payroll",
      result: "failure",
    });
    return { error: "Payroll unreachable", details: err.message };
  }

  if (resp.ok && respData && respData.success) {
    await base44.asServiceRole.entities.PayrollSubmission.update(submission.id, {
      status: "accepted",
      response_code: String(resp.status),
      response_message: respData.message || "accepted",
      response_payload: respData,
      completed_at: new Date().toISOString(),
      non_retryable: false,
    });
    await base44.asServiceRole.entities.PayrollPeriod.update(period.id, {
      status: "payroll_validated",
      payroll_confirmed_gross_total: respData.confirmed_gross_total ?? submittedGross,
      variance: +(((respData.confirmed_gross_total ?? submittedGross) - submittedGross)).toFixed(2),
    });
    await writeAuditLog(base44, {
      actor: "system",
      action: "payroll_submission_accepted",
      entityType: "PayrollSubmission",
      entityId: submission.id,
      requestId,
      destinationApplication: "arriv_payroll",
      result: "success",
    });
    return { success: true, submission_id: submission.submission_id, status: "accepted" };
  }

  const nonRetryable = isNonRetryableError(resp.status, respData && (respData.error || respData.message));
  const errMsg =
    (respData && (respData.error || respData.message)) ||
    `Payroll rejected with status ${resp.status}`;
  await markSubmissionFailed(base44, submission, resp.status, errMsg, nonRetryable);
  await base44.asServiceRole.entities.PayrollPeriod.update(period.id, {
    status: nonRetryable ? "payroll_rejected" : "failed",
  });
  await writeAuditLog(base44, {
    actor: "system",
    action: "payroll_submission_rejected",
    entityType: "PayrollSubmission",
    entityId: submission.id,
    requestId,
    destinationApplication: "arriv_payroll",
    result: nonRetryable ? "failure" : "warning",
  });
  return { error: errMsg, non_retryable: nonRetryable };
}

// Scheduled: retry failed retryable submissions and auto-send locked periods
// when automatic_payroll_enabled is on.
export async function processPendingSubmissions(base44) {
  const now = new Date().toISOString();
  const failed = await base44.asServiceRole.entities.PayrollSubmission.filter(
    { status: "failed", non_retryable: false },
    "-last_attempt_at",
    50
  );
  const retried = [];
  for (const s of failed || []) {
    if (s.next_attempt_at && s.next_attempt_at > now) continue;
    const res = await sendSubmission(base44, s.pay_period_id);
    retried.push({ pay_period_id: s.pay_period_id, result: res });
  }

  const locked = await base44.asServiceRole.entities.PayrollPeriod.filter({ status: "locked" });
  const autoSent = [];
  for (const p of locked || []) {
    if (!p.automatic_payroll_enabled) continue;
    const res = await sendSubmission(base44, p.pay_period_id);
    autoSent.push({ pay_period_id: p.pay_period_id, result: res });
  }

  return { retried: retried.length, auto_sent: autoSent.length, retried_details: retried, auto_sent_details: autoSent };
}