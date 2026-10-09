import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ============================================================================
// CHECK B2B DELINQUENCY — Automated Scanner
//
// Called by a scheduled workflow. Scans all unpaid B2B invoices, calculates
// delinquency status, sends scheduled notifications, applies booking
// restrictions when grace periods expire, and handles recovery.
//
// SAFETY: Never sends real customer notifications during certification mode.
// ============================================================================

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const b = base44.asServiceRole;

    const {
      calculateDelinquency, evaluateBookingRestriction, calculateNotificationSchedule,
      calculateOutstandingBalance, classifyCustomer, getGracePeriodDays,
      isEnterpriseClassification, DELINQUENCY_STATUS,
    } = await import('../../shared/b2bDelinquencyEngine.ts');

    const { buildB2BNotification } = await import('../../shared/b2bNotificationEngine.ts');
    const { isSyntheticRecord } = await import('../../shared/certificationMode.ts');

    // Helper: send notification via Brevo (SendEmail) — only in production mode
    async function sendNotification(type, org, invoice, recipientEmail) {
      if (certificationMode || !recipientEmail) return;
      try {
        const notif = buildB2BNotification(type, org, recipientEmail, org.billing_contact_name, {
          invoice_id: invoice?.id,
          invoice_number: invoice?.invoice_number,
          amount: invoice?.amount,
          due_date: invoice?.due_date,
        });
        await base44.integrations.Core.SendEmail({
          to: recipientEmail,
          subject: notif.subject,
          body: notif.body,
        });
      } catch (e) {
        console.warn(`Failed to send ${type} notification:`, e.message);
      }
    }

    const body = await req.json().catch(() => ({}));
    const certificationMode = body.certification_mode === true;
    const nowIso = new Date().toISOString();

    // ── Production-activation flag (defaults OFF) ──────────────────────────
    // When OFF, the scanner runs in DRY-RUN mode: it calculates delinquency
    // and updates invoice status fields, but does NOT send customer
    // notifications or apply booking restrictions. This prevents unintended
    // customer contact or account restrictions before an admin explicitly
    // enables production rollout.
    let productionActive = false;
    try {
      const flagRecords = await b.entities.AppSetting.filter(
        { key: 'B2B_DELINQUENCY_PRODUCTION_ACTIVE' },
        undefined,
        1
      );
      const flagArr = Array.isArray(flagRecords) ? flagRecords : (flagRecords?.data || []);
      productionActive = flagArr.length > 0 ? flagArr[0].value === 'true' : false;
    } catch (e) {
      console.warn('Could not read B2B_DELINQUENCY_PRODUCTION_ACTIVE flag, defaulting to OFF (dry-run):', e.message);
    }

    // In dry-run mode, suppress all customer-facing side effects
    const dryRun = !productionActive && !certificationMode;

    // Find all unpaid B2B invoices
    const allInvoices = await b.entities.Invoice.list('-created_date', 500);
    const unpaidB2B = allInvoices.filter(inv =>
      inv.payment_status === 'unpaid' &&
      (inv.invoice_type === 'b2b_annual_contract' ||
       inv.invoice_type === 'b2b_implementation' ||
       inv.invoice_type === 'b2b_approved_overage') &&
      (certificationMode || !isSyntheticRecord(inv)) // Skip cert fixtures in production scan (robust: checks certification_mode field AND cert_ prefix)
    );

    const processed = [];
    const notificationsSent = [];
    const restrictionsApplied = [];

    for (const invoice of unpaidB2B) {
      if (!invoice.b2b_organization_id) continue;

      // Load org and contract
      let org;
      try { org = await b.entities.B2BOrganization.get(invoice.b2b_organization_id); } catch { continue; }
      if (!org) continue;

      const contracts = await b.entities.B2BContract.filter({ organization_id: org.id });
      const contract = contracts.find(c => c.status === 'active' || c.status === 'live') || contracts[0];
      const contractType = contract?.contract_type || org.contract_type;

      const calc = calculateDelinquency({
        invoice,
        contract_type: contractType,
        delinquency_tier: org.delinquency_tier,
      });

      // Skip if not yet due, already paid, or has an active management exception
      if (calc.delinquency_status === DELINQUENCY_STATUS.NOT_YET_DUE ||
          calc.delinquency_status === DELINQUENCY_STATUS.PAYMENT_SUCCEEDED ||
          calc.delinquency_status === DELINQUENCY_STATUS.EXCEPTION_APPROVED) {
        continue;
      }

      // Calculate notification schedule
      const notif = calculateNotificationSchedule({
        days_past_due: calc.days_past_due,
        grace_period_days: calc.grace_period_days,
        grace_expired: calc.grace_expired,
        was_recovered: false,
        reminder_3d_sent: !!invoice.delinquency_reminder_3d_sent_at,
        reminder_7d_sent: !!invoice.delinquency_reminder_7d_sent_at,
        restriction_warning_sent: !!invoice.restriction_warning_sent_at,
        restriction_notice_sent: !!invoice.restriction_notice_sent_at,
        recovery_notice_sent: !!invoice.recovery_notice_sent_at,
        is_enterprise: isEnterpriseClassification(calc.classification),
      });

      const updates = {};

      // Send 3-day reminder (suppressed in dry-run mode)
      // In dry-run: do NOT stamp the sent timestamp — the notification was not sent.
      // Stamping it would cause the scanner to skip the reminder when production activates.
      if (notif.send_3d_reminder) {
        if (!dryRun) {
          updates.delinquency_reminder_3d_sent_at = nowIso;
          if (!certificationMode && org.billing_contact_email) {
            await sendNotification('past_due', org, invoice, org.billing_contact_email);
            notificationsSent.push({
              type: 'past_due_3d',
              invoice_id: invoice.id,
              recipient: org.billing_contact_email,
            });
          }
        }
      }

      // Send 7-day reminder (suppressed in dry-run mode)
      if (notif.send_7d_reminder) {
        if (!dryRun) {
          updates.delinquency_reminder_7d_sent_at = nowIso;
          if (!certificationMode && org.billing_contact_email) {
            await sendNotification('past_due', org, invoice, org.billing_contact_email);
            notificationsSent.push({
              type: 'past_due_7d',
              invoice_id: invoice.id,
              recipient: org.billing_contact_email,
            });
          }
        }
      }

      // Send advance warning (suppressed in dry-run mode)
      if (notif.send_advance_warning) {
        if (!dryRun) {
          updates.restriction_warning_sent_at = nowIso;
          if (!certificationMode && org.billing_contact_email) {
            await sendNotification('account_hold', org, invoice, org.billing_contact_email);
            notificationsSent.push({
              type: 'advance_restriction_warning',
              invoice_id: invoice.id,
              recipient: org.billing_contact_email,
            });
          }
        }
      }

      // Update delinquency status on invoice
      updates.delinquency_status = calc.delinquency_status;
      updates.days_past_due = calc.days_past_due;
      if (calc.grace_period_days !== undefined) updates.grace_period_days = calc.grace_period_days;
      if (calc.grace_period_deadline) updates.grace_period_deadline = calc.grace_period_deadline.split('T')[0];

      // Apply booking restriction when grace expires (non-enterprise auto)
      // SUPPRESSED in dry-run mode — restrictions are only calculated, not applied
      if (calc.grace_expired && !invoice.booking_restricted_at && calc.should_restrict_bookings) {
        if (dryRun) {
          // Dry-run: record what WOULD happen but do not restrict
          restrictionsApplied.push({
            organization_id: org.id,
            invoice_id: invoice.id,
            reason: 'GRACE_EXPIRED_AUTO (dry-run — not applied)',
            dry_run: true,
          });
        } else {
          updates.booking_restricted_at = nowIso;
          updates.delinquency_status = DELINQUENCY_STATUS.BOOKING_RESTRICTED;
          updates.restriction_notice_sent_at = nowIso;

          // Restrict the organization
          await b.entities.B2BOrganization.update(org.id, {
            booking_restricted: true,
            booking_restricted_at: nowIso,
            booking_restriction_reason: 'GRACE_EXPIRED',
          });

          restrictionsApplied.push({
            organization_id: org.id,
            invoice_id: invoice.id,
            reason: 'GRACE_EXPIRED_AUTO',
          });

          if (!certificationMode && org.billing_contact_email) {
            await sendNotification('account_hold', org, invoice, org.billing_contact_email);
            notificationsSent.push({
              type: 'account_hold',
              invoice_id: invoice.id,
              recipient: org.billing_contact_email,
            });
          }
        }
      }

      // Enterprise grace expired — flag for admin review (no auto-restriction)
      if (calc.grace_expired && calc.requires_enterprise_approval && !invoice.booking_restricted_at) {
        updates.delinquency_status = DELINQUENCY_STATUS.GRACE_EXPIRED;
        // Do NOT restrict — requires explicit management approval
      }

      // Persist invoice updates
      if (Object.keys(updates).length > 0) {
        await b.entities.Invoice.update(invoice.id, updates);
      }

      processed.push({
        invoice_id: invoice.id,
        organization_id: org.id,
        delinquency_status: updates.delinquency_status || calc.delinquency_status,
        days_past_due: calc.days_past_due,
        grace_expired: calc.grace_expired,
        notifications: notif,
        restricted: !!updates.booking_restricted_at,
      });
    }

    // Update org delinquency summaries
    const orgIds = [...new Set(unpaidB2B.map(inv => inv.b2b_organization_id).filter(Boolean))];
    for (const orgId of orgIds) {
      const orgInvoices = unpaidB2B.filter(inv => inv.b2b_organization_id === orgId);
      const outstanding = calculateOutstandingBalance(orgInvoices);
      await b.entities.B2BOrganization.update(orgId, {
        delinquency_outstanding_balance: outstanding.total_outstanding,
        delinquency_invoice_count: outstanding.invoice_count,
        delinquency_oldest_past_due_date: outstanding.oldest_past_due_date,
        delinquency_days_past_due_max: outstanding.days_past_due_max,
      });
    }

    return Response.json({
      status: 'completed',
      certification_mode: certificationMode,
      production_active: productionActive,
      dry_run: dryRun,
      invoices_processed: processed.length,
      notifications_sent: notificationsSent.length,
      restrictions_applied: restrictionsApplied.length,
      processed,
      notifications_sent_detail: notificationsSent,
      restrictions_applied_detail: restrictionsApplied,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}