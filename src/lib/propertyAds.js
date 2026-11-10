import { base44 } from "@/api/base44Client";

// Shared client helpers for property advertising.
//
// Nothing here decides eligibility, price, budget or state: every call goes to the server, which
// owns the advertising rules. This file only carries the request and formats what comes back.

export async function adAction(action, payload = {}) {
  const res = await base44.functions.invoke("managePropertyAdCampaign", { action, ...payload });
  return res?.data || res;
}

export async function adminAdAction(action, payload = {}) {
  const res = await base44.functions.invoke("adminPropertyAdCampaigns", { action, ...payload });
  return res?.data || res;
}

export const AD_STATUS_LABELS = {
  DRAFT: "Draft",
  AWAITING_CUSTOMER_APPROVAL: "Awaiting your approval",
  APPROVED: "Approved",
  AWAITING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  READY_FOR_REVIEW: "In review",
  READY_TO_LAUNCH: "Ready to launch",
  SUBMITTED: "Submitted to platform",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  REJECTED: "Not approved",
  PAUSED: "Paused",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
};

export const AD_STATUS_STYLES = {
  DRAFT: "bg-[#1A1A1A]/5 text-[#1A1A1A]/60",
  AWAITING_CUSTOMER_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-[#B8956A]/15 text-[#B8956A]",
  AWAITING_PAYMENT: "bg-amber-100 text-amber-800",
  PAID: "bg-[#B8956A]/15 text-[#B8956A]",
  READY_FOR_REVIEW: "bg-purple-100 text-purple-700",
  READY_TO_LAUNCH: "bg-purple-100 text-purple-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-[#1A1A1A]/8 text-[#1A1A1A]/70",
  REJECTED: "bg-red-100 text-red-700",
  PAUSED: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-[#1A1A1A]/5 text-[#1A1A1A]/50",
  REFUND_PENDING: "bg-amber-100 text-amber-800",
  REFUNDED: "bg-[#1A1A1A]/5 text-[#1A1A1A]/50",
};

export function money(cents) {
  if (cents === null || cents === undefined) return "—";
  return `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function metric(value) {
  if (value === null || value === undefined) return "Not reported yet";
  return Number(value).toLocaleString("en-US");
}