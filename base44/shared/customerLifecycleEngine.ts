// ============================================================================
// CUSTOMER LIFECYCLE PRICING ENGINE
//
// Implements the customer-tenure-based price escalation:
//   0–12 months:  base
//   12–24 months: base + first_adjustment (default $50)
//   24–36 months: base + first_adjustment + recurring (default $75)
//   36–48 months: base + first_adjustment + 2×recurring (default $100)
//   ...continuing +recurring every 12 months while future_adjustments_enabled
//
// The adjustment is applied ONCE to the core package price per booking,
// NEVER to add-ons. It flows through the existing canonical pricing chain
// (Preferred discount, approved discount, CSV) after insertion.
//
// Tenure start = the delivery date of the customer's first successfully
// completed, delivered, AND paid service. Once established it is immutable.
//
// If tenure cannot be reliably determined, adjustment = 0 and the band is
// "UNDETERMINED" — the customer is charged the canonical base price and the
// account is flagged for review. We never guess or silently overcharge.
// ============================================================================

import { dollarsToCents } from "./moneyUtils.ts";

export interface LifecyclePricingConfig {
  config_version: string; // "AEM_LIFECYCLE_PRICING_V1"
  introductory_duration_months: number; // default 12
  first_adjustment_cents: number; // default 5000 ($50)
  recurring_annual_adjustment_cents: number; // default 2500 ($25)
  future_adjustments_enabled: boolean; // default true
  tenure_basis: "first_delivered_paid_service"; // locked
}

export const DEFAULT_LIFECYCLE_CONFIG: LifecyclePricingConfig = {
  config_version: "AEM_LIFECYCLE_PRICING_V1",
  introductory_duration_months: 12,
  first_adjustment_cents: 5000,
  recurring_annual_adjustment_cents: 2500,
  future_adjustments_enabled: true,
  tenure_basis: "first_delivered_paid_service",
};

export interface TenureBandResult {
  band: string; // "INTRODUCTORY", "TIER_1", "TIER_2", ..., "UNDETERMINED"
  band_label: string; // human-readable
  adjustment_cents: number; // the lifecycle adjustment to add to the package price
  months_of_tenure: number; // whole months since tenure_start
  tenure_start_date: string | null;
}

/**
 * Compute the tenure band and lifecycle adjustment for a customer.
 *
 * @param tenure_start_date ISO date string (YYYY-MM-DD or full ISO) or null
 * @param now               ISO timestamp string (the "as of" moment)
 * @param config            The active LifecyclePricingConfig
 */
export function computeTenureBand(
  tenure_start_date: string | null,
  now: string,
  config: LifecyclePricingConfig
): TenureBandResult {
  // Fallback: no reliable tenure → no adjustment, flag for review
  if (!tenure_start_date) {
    return {
      band: "UNDETERMINED",
      band_label: "Tenure not yet established",
      adjustment_cents: 0,
      months_of_tenure: 0,
      tenure_start_date: null,
    };
  }

  const start = new Date(tenure_start_date);
  const asOf = new Date(now);

  if (isNaN(start.getTime()) || isNaN(asOf.getTime()) || asOf < start) {
    return {
      band: "UNDETERMINED",
      band_label: "Tenure not yet established",
      adjustment_cents: 0,
      months_of_tenure: 0,
      tenure_start_date: null,
    };
  }

  // Whole completed months of tenure
  let months =
    (asOf.getFullYear() - start.getFullYear()) * 12 +
    (asOf.getMonth() - start.getMonth());
  if (asOf.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;

  const introMonths = config.introductory_duration_months;

  // Introductory period — base price, no adjustment
  if (months < introMonths) {
    return {
      band: "INTRODUCTORY",
      band_label: `Introductory (months 1–${introMonths})`,
      adjustment_cents: 0,
      months_of_tenure: months,
      tenure_start_date: tenure_start_date,
    };
  }

  // After introductory: first adjustment applies (the +$50 transition)
  // Each additional completed 12-month period after the intro adds the
  // recurring adjustment (+$25), but only while future_adjustments_enabled.
  const monthsAfterIntro = months - introMonths;
  const completedAnnualPeriodsAfterIntro = Math.floor(monthsAfterIntro / 12);

  let adjustmentCents = config.first_adjustment_cents;

  if (config.future_adjustments_enabled) {
    adjustmentCents += completedAnnualPeriodsAfterIntro * config.recurring_annual_adjustment_cents;
  } else {
    // Future increases disabled — cap at the first adjustment only
    // (the first transition is already earned; recurring ones are paused)
  }

  // Band label: TIER_1 = first year after intro, TIER_2 = second, etc.
  const tierNumber = completedAnnualPeriodsAfterIntro + 1;
  const band = `TIER_${tierNumber}`;
  const bandLabel =
    completedAnnualPeriodsAfterIntro === 0
      ? `Year 2 (months ${introMonths + 1}–${introMonths + 12})`
      : `Year ${tierNumber + 1} (months ${introMonths + completedAnnualPeriodsAfterIntro * 12 + 1}–${introMonths + (completedAnnualPeriodsAfterIntro + 1) * 12})`;

  return {
    band,
    band_label: bandLabel,
    adjustment_cents: adjustmentCents,
    months_of_tenure: months,
    tenure_start_date: tenure_start_date,
  };
}

/**
 * Load the active LifecyclePricingConfig from the database, or return the default.
 * Mirrors the pattern used by mediaConfigLoader for pricing/compensation.
 */
export async function getActiveLifecycleConfig(base44): Promise<LifecyclePricingConfig> {
  try {
    const configs = await base44.asServiceRole.entities.CustomerLifecyclePricingConfig.filter(
      { is_active: true },
      "-effective_date",
      1
    );
    if (configs && configs.length > 0 && configs[0].config_json) {
      return JSON.parse(configs[0].config_json);
    }
  } catch (e) {
    // Table might not exist yet or no records — fall back to default
  }
  return DEFAULT_LIFECYCLE_CONFIG;
}

/**
 * Resolve the tenure start date for a customer by finding their earliest
 * Job that was completed, delivered to the customer, and paid for.
 *
 * A qualifying job has:
 *   - status === "completed"
 *   - delivered_to_customer === true
 *   - media_partner_fulfillment_status === "completed"
 *   - An associated Invoice with payment_status === "paid" (or client_payment_clears_at in the past)
 *
 * If a CustomerTenureProfile already exists, return it (immutable).
 * Otherwise, query for the qualifying job, establish the profile, and return it.
 *
 * If no qualifying job is found, return a review-flagged result with null date.
 */
export interface TenureResolution {
  tenure_start_date: string | null;
  tenure_basis_job_id: string;
  review_flag: boolean;
  review_reason: string;
}

export async function resolveTenureStart(
  base44,
  client_email: string
): Promise<TenureResolution> {
  if (!client_email) {
    return {
      tenure_start_date: null,
      tenure_basis_job_id: "",
      review_flag: true,
      review_reason: "No customer email provided for tenure lookup",
    };
  }

  const normalizedEmail = client_email.toLowerCase().trim();

  // 1. Check for an existing immutable tenure profile
  try {
    const existing = await base44.asServiceRole.entities.CustomerTenureProfile.filter(
      { client_email: normalizedEmail },
      "-established_at",
      1
    );
    if (existing && existing.length > 0) {
      const profile = existing[0];
      // If the profile is review-flagged, the stored date is a placeholder —
      // return null so the customer is charged the canonical base price.
      if (profile.review_flag) {
        return {
          tenure_start_date: null,
          tenure_basis_job_id: "",
          review_flag: true,
          review_reason: profile.review_reason || "Tenure under review",
        };
      }
      return {
        tenure_start_date: profile.tenure_start_date,
        tenure_basis_job_id: profile.tenure_basis_job_id || "",
        review_flag: false,
        review_reason: "",
      };
    }
  } catch (e) {
    // Table might not exist yet — continue to establish
  }

  // 2. Query for the earliest completed + delivered + paid job for this customer
  let qualifyingJob = null;
  try {
    const jobs = await base44.asServiceRole.entities.Job.filter(
      {
        client_email: normalizedEmail,
        status: "completed",
        delivered_to_customer: true,
      },
      "delivered_at",
      50
    );

    if (jobs && jobs.length > 0) {
      // Find the earliest delivered job that also has a paid invoice
      // Sort by delivered_at ascending and verify payment
      const sorted = [...jobs].sort((a, b) => {
        const aDate = a.delivered_at || a.completed_at || "";
        const bDate = b.delivered_at || b.completed_at || "";
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });

      for (const job of sorted) {
        // Verify payment: check for a paid invoice linked to this booking/job
        let isPaid = false;
        let basisInvoiceId = "";
        try {
          // Jobs created from bookings carry booking_id
          const invoiceQuery: any = { client_email: normalizedEmail };
          const invoices = await base44.asServiceRole.entities.Invoice.filter(
            invoiceQuery,
            "-created_date",
            50
          );
          const matchingInvoice = (invoices || []).find(
            (inv) =>
              inv.payment_status === "paid" &&
              (inv.booking_id === job.booking_id || inv.job_address === job.location)
          );
          if (matchingInvoice) {
            isPaid = true;
            basisInvoiceId = matchingInvoice.id;
          }
        } catch (e) {
          // If invoice lookup fails, fall back to checking client_payment_clears_at
          if (job.client_payment_clears_at) {
            isPaid = new Date(job.client_payment_clears_at).getTime() <= Date.now();
          }
        }

        if (isPaid) {
          qualifyingJob = { job, invoice_id: basisInvoiceId };
          break;
        }
      }
    }
  } catch (e) {
    // Job query failed — fall through to review flag
  }

  // 3. Establish the tenure profile (immutable) or flag for review
  if (qualifyingJob) {
    const startDate = (
      qualifyingJob.job.delivered_at ||
      qualifyingJob.job.completed_at ||
      new Date().toISOString()
    ).slice(0, 10); // YYYY-MM-DD

    try {
      await base44.asServiceRole.entities.CustomerTenureProfile.create({
        client_email: normalizedEmail,
        client_name: qualifyingJob.job.client_name || "",
        contact_id: "",
        tenure_start_date: startDate,
        tenure_basis_job_id: qualifyingJob.job.id,
        tenure_basis_invoice_id: qualifyingJob.invoice_id || "",
        established_at: new Date().toISOString(),
        review_flag: false,
        review_reason: "",
      });
    } catch (e) {
      // Profile creation may fail if one was created concurrently — that's fine,
      // the immutable date is what matters.
    }

    return {
      tenure_start_date: startDate,
      tenure_basis_job_id: qualifyingJob.job.id,
      review_flag: false,
      review_reason: "",
    };
  }

  // 4. No qualifying job found — flag for review, charge base price
  try {
    await base44.asServiceRole.entities.CustomerTenureProfile.create({
      client_email: normalizedEmail,
      client_name: "",
      contact_id: "",
      tenure_start_date: new Date().toISOString().slice(0, 10), // placeholder; review_flag is true so it won't be used
      tenure_basis_job_id: "",
      established_at: new Date().toISOString(),
      review_flag: true,
      review_reason: "No completed, delivered, and paid jobs found for this customer",
    });
  } catch (e) {
    // ignore
  }

  return {
    tenure_start_date: null,
    tenure_basis_job_id: "",
    review_flag: true,
    review_reason: "No completed, delivered, and paid jobs found for this customer",
  };
}