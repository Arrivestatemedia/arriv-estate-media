// The customer notices this app can send about a visibility subscription.
//
// Each notice is one definition, used by every sender, so the subject a customer sees in an inbox and
// the subject stored in the template can never drift apart. The class decides the rules:
//   * service   — a required billing or account notice. Sent while the notifications switch is on.
//   * marketing — optional. Sent only while the switch is on AND the address has not opted out, and
//                 every one of them carries a working unsubscribe link.
//
// Nothing here sends anything. A caller decides, then sends.

import { NOTICE_CLASS_MARKETING, NOTICE_CLASS_SERVICE, noticeClassOf } from "./notificationPreference.ts";

export interface Notice {
  key: string;
  notice_class: string;
  template_name: string;
  subject: string;
  headline: string;
  lines: string[];
  cta_label?: string;
  cta_path?: string;
}

const DASHBOARD_PATH = "/VisibilityDashboard";

export const VISIBILITY_NOTICES: Record<string, Notice> = {
  activated: {
    key: "activated",
    notice_class: NOTICE_CLASS_SERVICE,
    template_name: "VisibilitySubscriptionActivated",
    subject: "Your Arriv visibility plan is active",
    headline: "Your plan is active",
    lines: [
      "Your plan is now active and your benefits are switched on for the period you paid for.",
      "You can review your plan, your billing history and your renewal date at any time from your Subscription and Visibility dashboard.",
    ],
    cta_label: "Open my dashboard",
    cta_path: DASHBOARD_PATH,
  },
  payment_failed: {
    key: "payment_failed",
    notice_class: NOTICE_CLASS_SERVICE,
    template_name: "VisibilityPaymentFailed",
    subject: "We could not process your Arriv plan payment",
    headline: "Your payment did not go through",
    lines: [
      "Stripe could not complete the most recent charge for your visibility plan. Paid benefits are paused until the payment succeeds.",
      "Updating the card on your subscription restores the plan immediately. Nothing you have already paid for is lost.",
    ],
    cta_label: "Update my payment method",
    cta_path: DASHBOARD_PATH,
  },
  canceled: {
    key: "canceled",
    notice_class: NOTICE_CLASS_SERVICE,
    template_name: "VisibilitySubscriptionCanceled",
    subject: "Your Arriv visibility plan has ended",
    headline: "Your plan has ended",
    lines: [
      "Your visibility subscription has ended and paid benefits have stopped. Your profile, your property pages and every lead already recorded stay exactly where they were.",
    ],
    cta_label: "View my account",
    cta_path: DASHBOARD_PATH,
  },
  seats_changed: {
    key: "seats_changed",
    notice_class: NOTICE_CLASS_SERVICE,
    template_name: "VisibilitySeatChange",
    subject: "Your Arriv brokerage seats were updated",
    headline: "Your seats were updated",
    lines: [
      "The number of additional agent seats on your brokerage plan has changed. The new amount appears on your next invoice.",
    ],
    cta_label: "Manage my seats",
    cta_path: DASHBOARD_PATH,
  },
  renewal: {
    key: "renewal",
    notice_class: NOTICE_CLASS_MARKETING,
    template_name: "VisibilityRenewalReminder",
    subject: "Your Arriv visibility plan renews soon",
    headline: "Your plan renews soon",
    lines: [
      "Your plan renews automatically at the price you agreed. You can review or cancel it any time from your dashboard.",
    ],
    cta_label: "Review my plan",
    cta_path: DASHBOARD_PATH,
  },
  monthly_summary: {
    key: "monthly_summary",
    notice_class: NOTICE_CLASS_MARKETING,
    template_name: "VisibilityMonthlySummary",
    subject: "Your monthly Arriv visibility summary",
    headline: "Your month on Arriv",
    lines: [
      "Here is what Arriv recorded for your profile this month.",
      "Arriv reports only the figures it records itself. We do not report search rankings, Google impressions or promise any lead volume.",
    ],
    cta_label: "See the full detail",
    cta_path: DASHBOARD_PATH,
  },
};

export function noticeByKey(key: string): Notice | null {
  return VISIBILITY_NOTICES[String(key || "")] || null;
}

export function isMarketingNotice(notice: Notice): boolean {
  return noticeClassOf(notice) === NOTICE_CLASS_MARKETING;
}

// The plain-text body, used by the email sender. It states the same thing as the template.
export function noticeText(notice: Notice, context: { name?: string; detail?: string; appUrl?: string; unsubscribeUrl?: string }): string {
  const greeting = context?.name ? `Hi ${context.name},` : "Hello,";
  const parts = [greeting, "", ...notice.lines];
  if (context?.detail) parts.push("", context.detail);
  if (context?.appUrl) parts.push("", `${notice.cta_label || "Open your dashboard"}: ${context.appUrl}${notice.cta_path || ""}`);
  if (context?.unsubscribeUrl) {
    parts.push("", "You are receiving this because you have an Arriv professional profile.", `Unsubscribe from these emails: ${context.unsubscribeUrl}`);
  }
  parts.push("", "Arriv Estate Media");
  return parts.join("\n");
}

// A small, inbox-safe HTML body built from the same lines. Marketing notices always end with the
// unsubscribe link; service notices never do, because they are part of the service.
export function noticeHtml(notice: Notice, context: { name?: string; detail?: string; appUrl?: string; unsubscribeUrl?: string }): string {
  const escape = (value: any) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const paragraphs = [context?.name ? `Hi ${escape(context.name)},` : "Hello,", ...notice.lines.map(escape)];
  if (context?.detail) paragraphs.push(escape(context.detail));
  const cta = context?.appUrl
    ? `<p style="margin:24px 0"><a href="${escape(context.appUrl + (notice.cta_path || ""))}" style="background:#b8956a;color:#000000;padding:12px 22px;border-radius:6px;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:700">${escape(notice.cta_label || "Open your dashboard")}</a></p>`
    : "";
  const unsubscribe = context?.unsubscribeUrl
    ? `<p style="margin-top:28px;font-size:12px;color:#5b5b5b;font-family:Inter,Arial,sans-serif">You are receiving this because you have an Arriv professional profile. <a href="${escape(context.unsubscribeUrl)}" style="color:#8C6F45">Unsubscribe from these emails</a>.</p>`
    : "";
  return [
    `<div style="background:#ffffff;padding:0;font-family:Playfair Display,Georgia,serif;color:#1a1a1a">`,
    `<div style="background:#b8956a;padding:18px 24px;color:#000000;font-family:Inter,Arial,sans-serif;font-weight:700">Arriv Estate Media</div>`,
    `<div style="background:#fffbf5;border:1px solid #e5e7eb;border-radius:6px;padding:28px 24px;margin-top:16px">`,
    `<h1 style="margin:0 0 12px;font-size:26px;line-height:1.2">${escape(notice.headline)}</h1>`,
    ...paragraphs.map((line) => `<p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6">${line}</p>`),
    cta,
    unsubscribe,
    `</div>`,
    `<p style="margin:18px 0 0;font-size:12px;color:#5b5b5b;font-family:Inter,Arial,sans-serif">Arriv Estate Media</p>`,
    `</div>`,
  ].join("");
}