import { base44 } from "@/api/base44Client";
import { withCustomerSession } from "@/lib/customerSession";

/**
 * Client for the purchasing-context service.
 *
 * The browser only ever remembers WHICH context the customer picked. Every
 * authorization decision is made server-side from the signed session.
 */
const STORAGE_KEY = "purchasing_context";

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeStore(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the choice simply is not remembered */
  }
}

export function getStoredContext(email) {
  if (!email) return null;
  const stored = readStore()[String(email).toLowerCase()];
  if (!stored || !stored.type) return null;
  if (stored.type === "organization" && !stored.organization_id) return null;
  return stored;
}

export function storeContext(email, context) {
  if (!email) return;
  const store = readStore();
  store[String(email).toLowerCase()] = context;
  writeStore(store);
}

export function clearStoredContext(email) {
  if (!email) return;
  const store = readStore();
  delete store[String(email).toLowerCase()];
  writeStore(store);
}

async function call(payload) {
  const res = await base44.functions.invoke(
    "manageB2BPurchasingContext",
    withCustomerSession(payload)
  );
  return res?.data || res;
}

export async function loadPurchasingContexts() {
  const payload = await call({ action: "list_contexts" });
  if (payload?.status === "ERROR" || payload?.error) {
    throw new Error(payload.error || "Could not load your accounts.");
  }
  return payload?.data || payload;
}

export async function authorizeContext(organizationId) {
  const payload = await call({ action: "authorize", organization_id: organizationId || "" });
  const data = payload?.data || payload;
  if (data?.status === "ERROR" || data?.error) {
    throw new Error(data.error || "That account cannot be used right now.");
  }
  return data;
}

export async function loadOrganizationMembers(organizationId) {
  const payload = await call({ action: "list_members", organization_id: organizationId });
  if (payload?.status === "ERROR" || payload?.error) {
    throw new Error(payload.error || "Could not load the company team.");
  }
  return payload?.data || payload;
}

export async function inviteOrganizationMember({ organizationId, email, name, role }) {
  const payload = await call({
    action: "invite_member",
    organization_id: organizationId,
    email,
    name,
    role,
  });
  if (payload?.status === "ERROR" || payload?.error) {
    throw new Error(payload.error || "The invitation could not be created.");
  }
  return payload?.data || payload;
}

export async function updateOrganizationMemberRole({ organizationId, memberId, role }) {
  const payload = await call({
    action: "update_member_role",
    organization_id: organizationId,
    member_id: memberId,
    role,
  });
  if (payload?.status === "ERROR" || payload?.error) {
    throw new Error(payload.error || "The role could not be changed.");
  }
  return payload;
}

export async function setOrganizationMemberStatus({ organizationId, memberId, remove }) {
  const payload = await call({
    action: remove ? "deactivate_member" : "reactivate_member",
    organization_id: organizationId,
    member_id: memberId,
  });
  if (payload?.status === "ERROR" || payload?.error) {
    throw new Error(payload.error || "The member could not be updated.");
  }
  return payload;
}

/** Label for the chosen context, used in summaries and confirmations. */
export function contextLabel(context) {
  if (!context || context.type !== "organization") return "Myself";
  return context.organization_name || "Company account";
}