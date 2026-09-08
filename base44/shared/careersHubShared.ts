// Shared utilities for the Careers Hub / Job Page system

// Source normalization map — server-authoritative
const SOURCE_MAP: Record<string, string> = {
  direct: "direct",
  indeed: "indeed",
  linkedin: "linkedin",
  handshake: "handshake",
  facebook: "facebook",
  x: "x",
  twitter: "x",
  email: "email",
  qr_code: "qr_code",
  qr: "qr_code",
  company_website: "company_website",
  employee_referral: "employee_referral",
  referral: "employee_referral",
  other: "other",
};

export function normalizeSource(raw: string | undefined | null): string {
  if (!raw || raw.trim() === "") return "unknown";
  const key = raw.toLowerCase().trim();
  return SOURCE_MAP[key] || "other";
}

// Slugify a title into a URL-safe slug
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 80);
}

// Generate a stable job_id
export function generateJobId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `em_job_${ts}_${rand}`;
}

// SHA-256 hash a string using Web Crypto
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// HMAC-SHA256 signing for Khetha webhook payloads
export async function signPayload(payload: object, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = encoder.encode(JSON.stringify(payload));
  const sigBuffer = await crypto.subtle.sign("HMAC", key, data);
  const sigArray = Array.from(new Uint8Array(sigBuffer));
  return sigArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Emit a recruiting.mutation event to Khetha via the signed webhook
export async function emitRecruitingMutation(
  tenantId: string,
  mutationType: string,
  data: Record<string, any>,
  secret: string,
  webhookUrl: string
): Promise<void> {
  const eventId = crypto.randomUUID();
  const payload: Record<string, any> = {
    event_id: eventId,
    event_type: "recruiting.mutation",
    company_id: tenantId,
    timestamp: new Date().toISOString(),
    data: {
      idempotency_key: data.idempotency_key || data.job_id || data.application_id || eventId,
      mutation_type: mutationType,
      ...data,
    },
  };
  const signature = await signPayload(payload, secret);
  const body = { ...payload, signature };

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

// Default tenant branding values (Estate Media colors)
export const DEFAULT_BRANDING = {
  primary_color: "#B8956A",
  accent_color: "#A68559",
  company_name: "Arriv Estate Media",
  logo_url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png",
};