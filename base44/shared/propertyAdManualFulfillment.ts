// Manual Meta fulfilment.
//
// Arriv launches and runs these campaigns by hand in Meta Ads Manager. No Meta API credential is
// used, no request leaves the system, and the automatic publishing path is never opened: a manual
// campaign never gets a provider_campaign_id, so the API code cannot act on it by accident.
//
// What an administrator records here is evidence, not inference. A campaign only becomes Active
// after the four launch checks are confirmed, and a campaign is never marked paused because of what
// we *believe* happened at Meta — only after a person confirms the stop there.

import { money } from "./propertyAdPackages.ts";
import { canTransition } from "./propertyAdStateMachine.ts";
import { creativeComplianceIssues } from "./propertyAdCreative.ts";
import {
  applyReportedSpend,
  authorizationIsCurrent,
  campaignEligibility,
  updateCampaign,
} from "./propertyAdEngine.ts";

export const MANUAL_MODE = "manual";
export const MANUAL_RESULTS_SOURCE = "Meta Ads Manager";

// Shown to the customer and to the administrator building the campaign by hand.
export const HOUSING_AD_DISCLOSURES = [
  "Housing special ad category is required in Meta. Age, gender, detailed-interest, lookalike and custom-audience targeting are not available.",
  "The ad must use only the approved creative and copy, the approved property page link, and the property address as approved.",
  "No price, availability, amenity or feature may appear beyond what the approved listing content already states.",
  "Fair housing: no wording that states or implies a preference, limitation or discrimination.",
  "The campaign runs only for the purchased duration and within the authorized advertising budget. No result is guaranteed.",
];

export function isManual(campaign: any): boolean {
  return String(campaign?.fulfillment_mode || MANUAL_MODE) === MANUAL_MODE;
}

// Everything an administrator needs on screen to build the campaign in Meta without guessing.
export function manualKit(campaign: any, listing: any) {
  const creative = campaign?.creative || {};
  const variations = Array.isArray(creative.variations) && creative.variations.length
    ? creative.variations
    : [{ label: "Primary", headline: creative.headline, primary_text: creative.primary_text }];
  return {
    mode: MANUAL_MODE,
    delivery_method: "Manual Meta Ads Manager fulfilment",
    headline: creative.headline || "",
    primary_text: creative.primary_text || "",
    description: creative.description || "",
    call_to_action: creative.call_to_action || "",
    display_link: creative.display_link || "",
    variations,
    media: Array.isArray(creative.media) ? creative.media : [],
    property_url: campaign?.public_url || creative.link_url || "",
    property_address: listing?.property_address || "",
    ad_budget_cents: Number(campaign?.ad_budget_cents || 0),
    ad_budget_label: money(Number(campaign?.ad_budget_cents || 0)),
    duration_days: Number(campaign?.duration_days || 0),
    special_ad_category: creative.special_ad_category || "HOUSING",
    disclosures: HOUSING_AD_DISCLOSURES,
    results_source: MANUAL_RESULTS_SOURCE,
  };
}

// Blockers for creating the campaign by hand. Deliberately contains no API switch or API account
// requirement: manual fulfilment needs no credential. It still requires everything that protects
// the customer — payment, authorization, approval, eligible listing and compliant creative.
export function manualLaunchBlockers(campaign: any, input: { listing: any; now?: Date }): string[] {
  const now = input.now || new Date();
  const blockers: string[] = [];
  if (!isManual(campaign)) blockers.push("This campaign is not set to manual fulfilment.");
  if (campaign.status !== "READY_TO_LAUNCH") blockers.push(`Campaign state ${campaign.status} is not ready for manual launch.`);
  if (!authorizationIsCurrent(campaign)) blockers.push("The customer authorization is missing or out of date.");
  if (!campaign.stripe_payment_intent_id || Number(campaign.paid_amount_cents || 0) <= 0) blockers.push("The campaign has not been paid for.");
  if (!campaign.admin_approved_at) blockers.push("An administrator has not approved this campaign.");
  if (campaign.review_required) blockers.push(campaign.attention_reason || "The campaign is flagged for review.");
  for (const issue of creativeComplianceIssues(campaign.creative)) blockers.push(issue);
  for (const blocker of campaignEligibility(input.listing, now).blockers) blockers.push(blocker);
  if (campaign.manual?.meta_campaign_id) blockers.push("A Meta campaign ID is already recorded for this campaign.");
  const scheduled = Date.parse(String(campaign.scheduled_start_at || ""));
  if (Number.isFinite(scheduled) && scheduled > now.getTime()) blockers.push("The scheduled start time has not been reached.");
  return blockers;
}

function parseDate(value: any): Date | null {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Records the campaign that actually exists in Meta Ads Manager. This moves the campaign to
// SUBMITTED — never to ACTIVE — because nothing has confirmed it is delivering yet.
export async function recordManualLaunch(client: any, campaign: any, input: {
  actor: string;
  listing: any;
  metaCampaignId: string;
  launchedOn: string;
  scheduledEndOn: string;
  accountLabel: string;
  accountVerified: boolean;
  note?: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const blockers = manualLaunchBlockers(campaign, { listing: input.listing, now });
  if (blockers.length) {
    await updateCampaign(
      client,
      campaign,
      { launch_blocks: blockers, attention_reason: blockers[0] },
      { type: "manual_launch_blocked", actor: input.actor, note: blockers.slice(0, 3).join(" | ") },
      now,
    );
    return { ok: false as const, code: "MANUAL_LAUNCH_BLOCKED", blockers };
  }

  const metaCampaignId = String(input.metaCampaignId || "").trim();
  if (!metaCampaignId) return { ok: false as const, code: "META_CAMPAIGN_ID_REQUIRED" };

  const launchedOn = parseDate(input.launchedOn);
  if (!launchedOn) return { ok: false as const, code: "LAUNCH_DATE_REQUIRED" };
  const endOn = parseDate(input.scheduledEndOn);
  if (!endOn) return { ok: false as const, code: "END_DATE_REQUIRED" };
  if (endOn.getTime() <= launchedOn.getTime()) return { ok: false as const, code: "END_BEFORE_START" };

  const accountLabel = String(input.accountLabel || "").trim();
  if (!accountLabel) return { ok: false as const, code: "AD_ACCOUNT_REQUIRED" };
  if (input.accountVerified !== true) return { ok: false as const, code: "ACCOUNT_NOT_VERIFIED" };

  if (!canTransition(campaign.status, "SUBMITTED")) {
    return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  }

  const saved = await updateCampaign(
    client,
    campaign,
    {
      status: "SUBMITTED",
      fulfillment_mode: MANUAL_MODE,
      started_at: launchedOn.toISOString(),
      ends_at: endOn.toISOString(),
      launch_blocks: [],
      provider_status: "MANUAL_CREATED",
      manual: {
        ...(campaign.manual || {}),
        meta_campaign_id: metaCampaignId,
        account_label: accountLabel,
        account_verified: true,
        launched_on: launchedOn.toISOString(),
        scheduled_end_on: endOn.toISOString(),
        recorded_by: input.actor,
        recorded_at: now.toISOString(),
      },
    },
    { type: "manual_launch_recorded", actor: input.actor, note: `${metaCampaignId} — ${input.note || ""}`.trim() },
    now,
  );
  return { ok: true as const, campaign: saved };
}

// The four confirmations an administrator owes before a manual campaign is called Active.
export function manualActivationBlockers(campaign: any): string[] {
  const blockers: string[] = [];
  const manual = campaign?.manual || {};
  const confirmations = manual.confirmations || {};
  if (campaign.status !== "SUBMITTED") blockers.push(`Campaign state ${campaign.status} cannot be confirmed active.`);
  if (!manual.meta_campaign_id) blockers.push("No Meta campaign ID has been recorded.");
  if (!manual.launched_on) blockers.push("No launch date has been recorded.");
  if (!manual.scheduled_end_on) blockers.push("No campaign end date has been recorded.");
  if (manual.account_verified !== true) blockers.push("The advertising account has not been verified.");
  if (confirmations.housing_category !== true) blockers.push("The housing special ad category has not been confirmed.");
  if (confirmations.approved_creative !== true) blockers.push("The approved creative has not been confirmed.");
  if (confirmations.budget_ceiling !== true) blockers.push("The advertising budget ceiling has not been confirmed.");
  if (confirmations.end_date !== true) blockers.push("The campaign end date has not been confirmed in Meta.");
  if (campaign.manual_stop?.required === true && campaign.manual_stop?.confirmed !== true) {
    blockers.push("A stop is outstanding in Meta Ads Manager.");
  }
  return blockers;
}

export async function confirmManualActive(client: any, campaign: any, input: {
  actor: string;
  housingCategory: boolean;
  approvedCreative: boolean;
  budgetCeiling: boolean;
  endDate: boolean;
  note?: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const confirmations = {
    housing_category: input.housingCategory === true,
    approved_creative: input.approvedCreative === true,
    budget_ceiling: input.budgetCeiling === true,
    end_date: input.endDate === true,
    note: String(input.note || ""),
    confirmed_by: input.actor,
    confirmed_at: now.toISOString(),
  };
  const working = { ...campaign, manual: { ...(campaign.manual || {}), confirmations } };
  const blockers = manualActivationBlockers(working);
  if (blockers.length) {
    return { ok: false as const, code: "ACTIVATION_BLOCKED", blockers };
  }
  if (!canTransition(campaign.status, "ACTIVE")) {
    return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  }
  const saved = await updateCampaign(
    client,
    campaign,
    {
      status: "ACTIVE",
      manual: working.manual,
      provider_status: "ACTIVE_MANUAL",
      review_required: false,
      attention_reason: "",
    },
    { type: "manual_active_confirmed", actor: input.actor, note: input.note || "" },
    now,
  );
  return { ok: true as const, campaign: saved };
}

// Numbers are integers, never negative, and never invented: a blank field stays blank.
function count(value: any): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(String(value).replace(/[,$\s]/g, ""));
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

function spendCents(row: any): number | null {
  if (row?.spend_cents !== undefined && row?.spend_cents !== null && String(row.spend_cents).trim() !== "") {
    return count(row.spend_cents);
  }
  if (row?.spend !== undefined && row?.spend !== null && String(row.spend).trim() !== "") {
    const dollars = Number(String(row.spend).replace(/[,$\s]/g, ""));
    if (!Number.isFinite(dollars) || dollars < 0) return null;
    return Math.round(dollars * 100);
  }
  return null;
}

export function normalizeMetricRow(row: any) {
  const normalized = {
    impressions: count(row?.impressions),
    reach: count(row?.reach),
    clicks: count(row?.clicks),
    spend_cents: spendCents(row),
    note: String(row?.note || row?.label || ""),
  };
  const hasAny = [normalized.impressions, normalized.reach, normalized.clicks, normalized.spend_cents].some((value) => value !== null);
  return { ...normalized, hasAny };
}

// Accepts what an administrator pastes out of Meta Ads Manager: a JSON array, or CSV with a header
// row. Nothing is guessed — a row that cannot be read is reported, not filled in.
export function parseMetricRows(text: string): { rows: any[]; errors: string[] } {
  const errors: string[] = [];
  const raw = String(text || "").trim();
  if (!raw) return { rows: [], errors: ["Nothing was pasted."] };

  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const rows = list.map(normalizeMetricRow).filter((row) => row.hasAny);
      if (!rows.length) errors.push("No impression, reach, click or spend figure was found.");
      return { rows, errors };
    } catch {
      return { rows: [], errors: ["That JSON could not be read."] };
    }
  }

  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], errors: ["A header row and at least one data row are required."] };
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const header = lines[0].split(delimiter).map((cell) => cell.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows: any[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter);
    const row: Record<string, any> = {};
    header.forEach((key, index) => {
      row[key] = (cells[index] ?? "").trim();
    });
    const normalized = normalizeMetricRow(row);
    if (normalized.hasAny) rows.push(normalized);
    else errors.push(`Skipped a row with no usable figures: ${line.slice(0, 40)}`);
  }
  if (!rows.length) errors.push("No row contained an impression, reach, click or spend figure.");
  return { rows, errors };
}

const METRIC_ALLOWED_STATUSES = ["SUBMITTED", "ACTIVE", "PAUSED", "COMPLETED"];

// Records results read from Meta Ads Manager. The figures become the campaign's reported metrics
// only when they are entered here, and the spend always flows through the same budget ledger the
// API path uses, so the authorized ceiling holds either way.
export async function recordManualMetrics(client: any, campaign: any, input: {
  actor: string;
  rows?: any[];
  importText?: string;
  source?: string;
  note?: string;
  verified?: boolean;
  now?: Date;
}) {
  const now = input.now || new Date();
  if (!isManual(campaign)) return { ok: false as const, code: "NOT_MANUAL" };
  if (!METRIC_ALLOWED_STATUSES.includes(campaign.status)) {
    return { ok: false as const, code: "INVALID_STATE", status: campaign.status };
  }

  let rows = Array.isArray(input.rows) ? input.rows : [];
  const errors: string[] = [];
  if (!rows.length && input.importText) {
    const parsed = parseMetricRows(input.importText);
    rows = parsed.rows;
    errors.push(...parsed.errors);
  }
  const normalized = rows.map(normalizeMetricRow).filter((row) => row.hasAny);
  if (!normalized.length) {
    return { ok: false as const, code: "NO_METRICS", message: "No impression, reach, click or spend figure was provided.", errors };
  }

  const totals = normalized[normalized.length - 1];
  if (totals.impressions === null || totals.clicks === null || totals.spend_cents === null) {
    return {
      ok: false as const,
      code: "METRICS_INCOMPLETE",
      message: "Impressions, clicks and spend are all required for a reported figure.",
      errors,
    };
  }

  const source = String(input.source || MANUAL_RESULTS_SOURCE).trim() || MANUAL_RESULTS_SOURCE;
  const entries = normalized.map((row) => ({
    at: now.toISOString(),
    source,
    entered_by: input.actor,
    impressions: row.impressions,
    reach: row.reach,
    clicks: row.clicks,
    spend_cents: row.spend_cents,
    note: row.note || "",
  }));

  const existing = Array.isArray(campaign.manual_metrics) ? campaign.manual_metrics : [];
  const savedMetrics = await updateCampaign(
    client,
    campaign,
    {
      manual_metrics: [...existing, ...entries].slice(-200),
      metrics: {
        impressions: totals.impressions,
        reach: totals.reach,
        clicks: totals.clicks,
        spend_cents: totals.spend_cents,
        reported_at: now.toISOString(),
        source,
        reporting_mode: "manual",
        entered_by: input.actor,
        verified: input.verified === true,
      },
    },
    { type: "manual_metrics_recorded", actor: input.actor, note: `${totals.impressions} impressions · ${money(totals.spend_cents)} spend · ${source}` },
    now,
  );

  // Spend goes through the shared ledger and ceiling check, exactly as an API sync would.
  const spend = await applyReportedSpend(client, savedMetrics || campaign, Number(totals.spend_cents || 0), {
    reference: `manual_${campaign.campaign_id}_${now.toISOString()}`,
    now,
  });

  return {
    ok: true as const,
    campaign: spend.campaign || savedMetrics,
    over_budget: spend.ok === false,
    applied_cents: spend.applied ?? 0,
    errors,
    results: { ...totals, source, reporting_mode: "manual" },
  };
}

// Reconciles verified spend against the prepaid advertising budget. Any unspent customer money is
// surfaced as a refund due for an administrator's decision — never refunded automatically.
export async function reconcileManualBudget(client: any, campaign: any, input: {
  actor: string;
  note?: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const authorized = Number(campaign.ad_budget_cents || 0);
  const spent = Number(campaign.spent_cents || 0);
  const refunded = Number(campaign.refunded_cents || 0);
  const unspent = Math.max(0, authorized - spent);
  const refundDue = Math.max(0, unspent - refunded);

  let ledger: any[] = [];
  try {
    const result = await client.asServiceRole.entities.PropertyAdLedgerEntry.filter({ campaign_id: campaign.campaign_id });
    ledger = Array.isArray(result) ? result : result?.items || [];
  } catch {
    ledger = [];
  }
  const alreadyReleased = ledger.some((entry) => entry.entry_type === "budget_release");
  const finished = ["COMPLETED", "CANCELLED", "REJECTED"].includes(campaign.status);

  if (finished && unspent > 0 && !alreadyReleased) {
    await client.asServiceRole.entities.PropertyAdLedgerEntry.create({
      entry_id: `adl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      campaign_id: campaign.campaign_id,
      listing_id: campaign.listing_id,
      client_email: campaign.client_email,
      package_tier: campaign.package_tier,
      entry_type: "budget_release",
      amount_cents: -unspent,
      balance_after_cents: 0,
      provider: campaign.provider,
      reference: `manual_reconcile_${campaign.campaign_id}`,
      note: "Unspent advertising budget released on manual reconciliation",
      actor: input.actor,
      at: now.toISOString(),
      certification_mode: campaign.certification_mode === true,
    });
  }

  const reconciliation = {
    authorized_cents: authorized,
    spent_cents: spent,
    unspent_cents: unspent,
    refunded_cents: refunded,
    refund_due_cents: refundDue,
    management_fee_cents: Number(campaign.management_fee_cents || 0),
    reconciled_at: now.toISOString(),
    reconciled_by: input.actor,
    note: String(input.note || ""),
  };

  const saved = await updateCampaign(
    client,
    campaign,
    {
      spend_reconciliation: reconciliation,
      review_required: refundDue > 0 ? true : campaign.review_required === true,
      attention_reason: refundDue > 0
        ? `${money(refundDue)} of advertising budget is unspent and needs a refund decision.`
        : campaign.attention_reason || "",
    },
    {
      type: "manual_reconciled",
      actor: input.actor,
      note: `${money(spent)} spent of ${money(authorized)} · ${money(unspent)} unspent${refundDue > 0 ? ` · ${money(refundDue)} refund due` : ""}`,
    },
    now,
  );

  return { ok: true as const, campaign: saved, reconciliation };
}

// What the customer is told, in their words, for a manually fulfilled campaign.
export const MANUAL_STATUS_HELP: Record<string, string> = {
  SUBMITTED: "The campaign has been created in Meta Ads Manager and Arriv is confirming it is running.",
  ACTIVE: "The campaign is running in Meta Ads Manager and managed by Arriv.",
  PAUSED: "Arriv has stopped this campaign in Meta Ads Manager.",
  COMPLETED: "The campaign has ended and the results Arriv read from Meta Ads Manager are shown below.",
};

export function manualReportingNote(campaign: any): string {
  if (!isManual(campaign)) return "";
  return "Results are entered by Arriv from Meta Ads Manager, not synchronised automatically.";
}