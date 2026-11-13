import { base44 } from "@/api/base44Client";

const read = (key) =>
  localStorage.getItem(key) || sessionStorage.getItem(key) || undefined;

/**
 * Every Call Center request carries the signed-in admin's own credentials.
 * The app signs admins in through its sales login rather than a platform
 * session, so without these the admin check cannot identify the caller.
 */
export function callCenter(payload = {}) {
  return base44.functions
    .invoke("callCenterAdmin", {
      email: read("sales_member_email") || read("user_email"),
      sales_member_id: read("sales_member_id"),
      ...payload,
    })
    .then((r) => r?.data ?? r);
}