import { base44 } from "@/api/base44Client";

const read = (key) => localStorage.getItem(key) || sessionStorage.getItem(key) || undefined;

/**
 * Every IVR studio request carries the signed-in administrator's own
 * credentials; the backend re-checks the admin role on every action.
 */
export function ivrStudio(payload = {}) {
  return base44.functions
    .invoke("ivrStudio", {
      email: read("sales_member_email") || read("user_email"),
      sales_member_id: read("sales_member_id"),
      ...payload,
    })
    .then((r) => r?.data ?? r);
}