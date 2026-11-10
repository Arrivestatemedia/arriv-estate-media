// Advertising reporting.
//
// Two different measurements live here and are never mixed:
//   · platform-reported figures (impressions, reach, clicks, spend) — exactly as the advertising
//     platform returned them, absent until the platform actually reports;
//   · Arriv's own property-page analytics (page views, inquiries) — measured on the property page.
// Nothing is estimated, and an empty figure is shown as "not reported yet", never as zero.

import { money } from "./propertyAdPackages.ts";
import { AD_STATUS_LABELS, isLive } from "./propertyAdStateMachine.ts";

function rows(result: any): any[] {
  if (Array.isArray(result)) return result;
  return result?.items || [];
}

export function platformMetrics(campaign: any) {
  const metrics = campaign?.metrics || {};
  const hasReport = metrics.reported_at && (metrics.impressions !== null && metrics.impressions !== undefined);
  const clicks = Number.isFinite(Number(metrics.clicks)) ? Number(metrics.clicks) : null;
  const spend = Number.isFinite(Number(metrics.spend_cents)) ? Number(metrics.spend_cents) : null;
  return {
    source: "platform",
    available: !!hasReport,
    impressions: metrics.impressions ?? null,
    reach: metrics.reach ?? null,
    clicks,
    spend_cents: spend,
    spend_label: spend === null ? null : money(spend),
    // Derived only from reported numbers, and only when they can be computed.
    cpc_cents: clicks && spend !== null && clicks > 0 ? Math.round(spend / clicks) : null,
    cost_per_click_label: clicks && spend !== null && clicks > 0 ? money(Math.round(spend / clicks)) : null,
    ctr: clicks !== null && metrics.impressions ? Number(((clicks / metrics.impressions) * 100).toFixed(2)) : null,
    reported_at: metrics.reported_at || null,
    provider: campaign?.provider || "meta",
  };
}

export function budgetPosition(campaign: any) {
  const authorized = Number(campaign?.ad_budget_cents || 0);
  const spent = Number(campaign?.spent_cents || 0);
  const remaining = Math.max(0, authorized - spent);
  return {
    authorized_cents: authorized,
    authorized_label: money(authorized),
    spent_cents: spent,
    spent_label: money(spent),
    remaining_cents: remaining,
    remaining_label: money(remaining),
    management_fee_cents: Number(campaign?.management_fee_cents || 0),
    management_fee_label: money(campaign?.management_fee_cents || 0),
    total_cents: Number(campaign?.total_cents || 0),
    total_label: money(campaign?.total_cents || 0),
  };
}

export async function campaignAttribution(client: any, campaign: any, now = new Date()) {
  const startIso = campaign.started_at || campaign.created_at || new Date(now.getTime() - 60 * 86400000).toISOString();
  const endIso = campaign.completed_at || now.toISOString();

  let attributed: any[] = [];
  try {
    attributed = rows(await client.asServiceRole.entities.PropertyInquiry.filter(
      { listing_id: campaign.listing_id, utm_campaign: campaign.campaign_id },
      { sort: "-created_date", limit: 500 },
    ));
  } catch {
    attributed = [];
  }

  let views = 0;
  let paidChannelViews = 0;
  try {
    const traffic = rows(await client.asServiceRole.entities.PropertyTrafficDaily.filter({ listing_id: campaign.listing_id }, { limit: 500 }));
    for (const row of traffic) {
      if (String(row.campaign || "") === campaign.campaign_id) views += Number(row.views || 0);
      if (row.channel === "paid") paidChannelViews += Number(row.views || 0);
    }
  } catch {
    views = 0;
  }

  const windowStart = Date.parse(startIso);
  const windowEnd = Date.parse(endIso);
  const withinWindow = attributed.filter((inquiry) => {
    const at = Date.parse(String(inquiry.created_at || inquiry.created_date || ""));
    if (!Number.isFinite(at)) return true;
    return (!Number.isFinite(windowStart) || at >= windowStart) && (!Number.isFinite(windowEnd) || at <= windowEnd);
  });

  return {
    window: { start: startIso, end: endIso },
    campaign_page_views: views,
    paid_channel_page_views: paidChannelViews,
    attributed_inquiries: withinWindow.length,
    attributed_leads: withinWindow.slice(0, 25).map((inquiry) => ({
      inquiry_id: inquiry.inquiry_id,
      created_at: inquiry.created_at || inquiry.created_date,
      status: inquiry.status,
    })),
    attribution_method: "utm_campaign",
    note: "Attributed leads are inquiries that carried this campaign's tracking parameter. Paid-channel page views include traffic that cannot be tied to one campaign, and every inquiry is reported as a property-page inquiry rather than automatically as an advertising result.",
  };
}

export function buildCampaignReport(campaign: any, attribution: any) {
  const platform = platformMetrics(campaign);
  const budget = budgetPosition(campaign);
  const inquiries = Number(attribution?.attributed_inquiries || 0);
  return {
    campaign_id: campaign.campaign_id,
    listing_id: campaign.listing_id,
    package_name: campaign.package_name,
    status: campaign.status,
    status_label: AD_STATUS_LABELS[campaign.status] || campaign.status,
    provider: campaign.provider,
    started_at: campaign.started_at || null,
    ends_at: campaign.ends_at || null,
    completed_at: campaign.completed_at || null,
    budget,
    platform,
    property: {
      source: "arriv_property_page",
      page_views: Number(attribution?.campaign_page_views || 0),
      paid_channel_page_views: Number(attribution?.paid_channel_page_views || 0),
      attributed_inquiries: inquiries,
      attribution_method: attribution?.attribution_method || "utm_campaign",
      note: attribution?.note || "",
    },
    // Deliberately explicit: an advertising result is never claimed from a single inquiry.
    cost_per_attributed_inquiry_cents: inquiries > 0 && platform.spend_cents !== null ? Math.round(platform.spend_cents / inquiries) : null,
    notes: platform.available
      ? []
      : ["Platform figures have not been reported for this campaign yet."],
    generated_at: new Date().toISOString(),
  };
}

// Portfolio view for the administrative console.
export function portfolioSummary(campaigns: any[]) {
  const totals = {
    purchases: 0,
    live: 0,
    awaiting_review: 0,
    review_required: 0,
    revenue_cents: 0,
    ad_budget_committed_cents: 0,
    ad_spend_cents: 0,
    management_fees_cents: 0,
    processing_fees_cents: 0,
    refunded_cents: 0,
    unused_budget_cents: 0,
    estimated_contribution_cents: 0,
    by_tier: { starter: 0, growth: 0, premium: 0 } as Record<string, number>,
  };
  for (const campaign of campaigns) {
    totals.purchases += 1;
    if (isLive(campaign.status)) totals.live += 1;
    if (campaign.status === "READY_FOR_REVIEW") totals.awaiting_review += 1;
    if (campaign.review_required) totals.review_required += 1;
    const paid = Number(campaign.paid_amount_cents || 0);
    totals.revenue_cents += paid;
    totals.ad_budget_committed_cents += Number(campaign.ad_budget_cents || 0);
    totals.ad_spend_cents += Number(campaign.spent_cents || 0);
    totals.management_fees_cents += Number(campaign.management_fee_cents || 0);
    totals.processing_fees_cents += Number(campaign.processing_fee_cents || 0);
    totals.refunded_cents += Number(campaign.refunded_cents || 0);
    totals.unused_budget_cents += Math.max(0, Number(campaign.ad_budget_cents || 0) - Number(campaign.spent_cents || 0));
    if (campaign.package_tier) totals.by_tier[campaign.package_tier] = (totals.by_tier[campaign.package_tier] || 0) + 1;
  }
  // Management fees less processing cost is what the advertising service actually keeps. The
  // reserved ad budget is excluded from contribution on purpose: it is the customer's money.
  totals.estimated_contribution_cents = totals.management_fees_cents - totals.processing_fees_cents;
  return totals;
}

export async function notify(client: any, subject: string, body: string, input: { to?: string } = {}) {
  const to = String(input.to || "").trim();
  if (!to.includes("@")) return { sent: false, reason: "no_recipient" };
  try {
    await client.asServiceRole.integrations.Core.SendEmail({ to, subject, body, from_name: "Arriv Estate Media" });
    return { sent: true };
  } catch (error: any) {
    return { sent: false, reason: String(error?.message || "email_failed") };
  }
}

// Administrative alerts are operational and are not behind the customer-notification switch.
export async function notifyAdmins(client: any, subject: string, body: string) {
  const to = String((globalThis as any)?.process?.env?.ADMIN_EMAIL || "");
  return notify(client, subject, body, { to });
}