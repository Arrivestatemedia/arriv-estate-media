import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export async function verifyAndGet(base44, applicationId, fullName, addressPrefix) {
  const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
  if (!app) return { error: "Application not found", status: 404 };
  const nameOk = (app.full_name || "").trim().toLowerCase() === String(fullName || "").trim().toLowerCase();
  const addrOk = (app.address || "").trim().toLowerCase().startsWith(String(addressPrefix || "").trim().toLowerCase());
  if (!nameOk || !addrOk) return { error: "Application details did not match our records", status: 403 };
  return { app };
}

export function computeStep(rec) {
  const done = {
    2: !!rec.personal_info_completed_at,
    3: !!rec.ica_signed_at,
    4: !!rec.w9_completed_at,
    5: !!rec.stripe_connected_at,
    6: !!rec.welcome_video_watched_at,
    7: !!rec.training_started_at,
  };
  for (let s = 2; s <= 7; s++) if (!done[s]) return s;
  return 8; // all complete
}

export function buildPortalLink(app) {
  let appDomain = Deno.env.get("BASE44_APP_DOMAIN") || "app.arrivestatemedia.com";
  while (/^https?:\/\//i.test(appDomain)) appDomain = appDomain.replace(/^https?:\/\//i, "");
  appDomain = appDomain.replace(/\/+$/, "");
  const name = encodeURIComponent(app.full_name || "");
  const digits = (app.address || "").match(/\d+/)?.[0] || "";
  return `https://${appDomain}/ApplicationPortal?name=${name}&addr=${encodeURIComponent(digits)}`;
}