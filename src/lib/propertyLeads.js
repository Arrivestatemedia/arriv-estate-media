import { base44 } from "@/api/base44Client";
import { withCustomerSession } from "@/lib/customerSession";

// Thin wrapper around the lead dashboard endpoint. The endpoint decides what this person may see
// from the listing's own client_email, so nothing here is trusted to filter anything.

export const LEAD_CHANNEL_LABELS = {
  paid: "Paid",
  social: "Social",
  organic: "Search",
  referral: "Referral",
  internal: "Arriv",
  direct: "Direct",
};

// The identity this app already uses for a customer session, plus the sales-console identity an
// administrator uses. Both are passed so the server can verify one or the other.
export function leadIdentity() {
  const get = (key) => localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  return {
    clientEmail: get("user_email"),
    clientName: get("user_name"),
    sales_member_id: get("sales_member_id"),
    sales_member_email: get("sales_member_email"),
  };
}

export function hasLeadIdentity(identity) {
  return Boolean(identity.clientEmail || identity.sales_member_id);
}

export async function fetchLeads() {
  const res = await base44.functions.invoke(
    "getPropertyLeads",
    withCustomerSession({ action: "summary", ...leadIdentity() }),
  );
  return res?.data || res;
}

export async function setLeadStatus(inquiryId, status) {
  const res = await base44.functions.invoke("getPropertyLeads", withCustomerSession({
    action: "update_inquiry",
    inquiryId,
    status,
    ...leadIdentity(),
  }));
  return res?.data || res;
}

export async function resendLead(inquiryId) {
  const res = await base44.functions.invoke("getPropertyLeads", withCustomerSession({
    action: "resend_delivery",
    inquiryId,
    ...leadIdentity(),
  }));
  return res?.data || res;
}

export function deliveryLabel(lead) {
  if (lead.notification_status === "delivered") return "Emailed to you";
  if (lead.notification_status === "failed") return "Delivery failed";
  if (lead.notification_status === "retrying") return "Retrying";
  if (lead.notification_status === "pending_agent_delivery") return "Sending";
  return "Recorded";
}

export function channelLabel(lead) {
  const base = LEAD_CHANNEL_LABELS[lead.channel] || "Direct";
  const detail = lead.utm_source || lead.referrer_host || "";
  return detail ? `${base} · ${detail}` : base;
}

export function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function listingAddress(listing) {
  if (!listing) return "";
  const location = [listing.city, listing.state].filter(Boolean).join(", ");
  return [listing.property_address, location].filter(Boolean).join(", ");
}