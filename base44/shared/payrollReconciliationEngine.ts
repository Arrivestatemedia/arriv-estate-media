// Payroll reconciliation: compares Arriv Payroll's independently recalculated
// per-employee gross against what Arriv One submitted, flags variance beyond
// the $0.01 rounding tolerance, and drives period-level validation states.

const TOLERANCE = 0.01;

// Upsert a PayrollReconciliation record for one employee in a period/version.
export async function reconcileEmployee(base44, input) {
  const {
    pay_period_id,
    payroll_version,
    arriv_employee_id,
    received_source_record_count,
    payroll_recalculated_gross,
    arriv_one_submitted_gross,
    payroll_snapshot_checksum,
    response_timestamp,
  } = input;

  const recGross = +(payroll_recalculated_gross || 0);
  const subGross = +(arriv_one_submitted_gross || 0);
  const variance = +(recGross - subGross).toFixed(2);
  const matched = Math.abs(variance) <= TOLERANCE;

  const existing = await base44.asServiceRole.entities.PayrollReconciliation.filter({
    pay_period_id,
    payroll_version,
    arriv_employee_id,
  });

  const payload = {
    reconciliation_id: existing && existing[0] ? existing[0].reconciliation_id : `rec_${crypto.randomUUID()}`,
    pay_period_id,
    payroll_version,
    arriv_employee_id,
    received_source_record_count: received_source_record_count ?? 0,
    payroll_recalculated_gross: recGross,
    arriv_one_submitted_gross: subGross,
    variance,
    rounding_tolerance: TOLERANCE,
    validation_status: matched ? "matched" : "mismatched",
    validation_errors: matched ? [] : [`Variance $${variance.toFixed(2)} exceeds $${TOLERANCE.toFixed(2)} tolerance`],
    payroll_snapshot_checksum: payroll_snapshot_checksum || "",
    response_timestamp: response_timestamp || new Date().toISOString(),
  };

  let record;
  if (existing && existing[0]) {
    record = await base44.asServiceRole.entities.PayrollReconciliation.update(existing[0].id, payload);
  } else {
    record = await base44.asServiceRole.entities.PayrollReconciliation.create(payload);
  }
  return { record, matched, variance };
}

// Process a full reconciliation webhook payload for a period/version.
export async function reconcilePeriod(base44, payload) {
  const { pay_period_id, payroll_version, employees, company_snapshot_checksum } = payload;
  if (!pay_period_id || !Array.isArray(employees)) {
    return { error: "pay_period_id and employees[] are required" };
  }

  const results = [];
  let allMatched = true;
  let confirmedGross = 0;
  for (const emp of employees) {
    const res = await reconcileEmployee(base44, {
      pay_period_id,
      payroll_version,
      arriv_employee_id: emp.arriv_employee_id,
      received_source_record_count: emp.received_source_record_count,
      payroll_recalculated_gross: emp.payroll_recalculated_gross,
      arriv_one_submitted_gross: emp.arriv_one_submitted_gross,
      payroll_snapshot_checksum: emp.payroll_snapshot_checksum,
      response_timestamp: payload.response_timestamp || new Date().toISOString(),
    });
    results.push(res);
    if (!res.matched) allMatched = false;
    confirmedGross += res.record.payroll_recalculated_gross || 0;
  }
  confirmedGross = +confirmedGross.toFixed(2);

  const period = (await base44.asServiceRole.entities.PayrollPeriod.filter({ pay_period_id }))[0];
  if (period) {
    const expected = period.expected_gross_commission_total || 0;
    await base44.asServiceRole.entities.PayrollPeriod.update(period.id, {
      status: allMatched ? "payroll_validated" : "correction_required",
      payroll_confirmed_gross_total: confirmedGross,
      variance: +(confirmedGross - expected).toFixed(2),
    });
  }

  const submission = (
    await base44.asServiceRole.entities.PayrollSubmission.filter({
      pay_period_id,
      payroll_version,
    })
  )[0];
  if (submission) {
    await base44.asServiceRole.entities.PayrollSubmission.update(submission.id, {
      status: allMatched ? "accepted" : "requires_review",
      response_payload: payload,
      response_code: allMatched ? "reconciled" : "variance",
      response_message: allMatched ? "reconciliation matched" : "variance beyond tolerance",
      completed_at: allMatched ? new Date().toISOString() : null,
    });
  }

  return {
    success: true,
    pay_period_id,
    payroll_version,
    employees_reconciled: results.length,
    all_matched: allMatched,
    confirmed_gross_total: confirmedGross,
    company_snapshot_checksum: company_snapshot_checksum || "",
  };
}