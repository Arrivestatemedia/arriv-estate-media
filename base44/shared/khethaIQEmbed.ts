// khethaIQEmbed.ts
// Shared logic for embedding the main KhethaIQ application into Arriv Estate Media.
// Handles SSO token generation/signing, HMAC webhook validation, theme token
// definitions, and Estate Media recruiting context.
//
// Used by:
//   - generateKhethaIQSSOToken (SSO token for the iframe embed)
//   - receiveKhethaIQHireEvent (HMAC signature validation for hire handoff webhook)
//   - KhethaIQEmbed.jsx (theme + context passed via postMessage)

import { secrets } from "base44:runtime";

const CALLING_APPLICATION = "ARRIV_ESTATE_MEDIA";
const TENANT_ID = "arriv_estate_media";
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// ---------------------------------------------------------------------------
// Base64URL helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256(data: string, secret: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(sig);
}

// ---------------------------------------------------------------------------
// SSO Token — signed payload for the main KhethaIQ app to validate server-side
// ---------------------------------------------------------------------------

export async function generateSSOToken(params: {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
}): Promise<string> {
  const secret = secrets.get("ARRIV_ESTATE_MEDIA_SECRET");
  if (!secret) throw new Error("ARRIV_ESTATE_MEDIA_SECRET is not set");

  const payload = {
    ...params,
    tenant_id: TENANT_ID,
    calling_application: CALLING_APPLICATION,
    entitlement: "full",
    exp: Date.now() + TOKEN_TTL_MS,
  };

  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSha256(payloadB64, secret);
  const sigB64 = base64UrlEncode(sig);

  return `${payloadB64}.${sigB64}`;
}

// ---------------------------------------------------------------------------
// HMAC Webhook Validation — for receiveKhethaIQHireEvent
// ---------------------------------------------------------------------------

export async function validateWebhookSignature(
  body: string,
  signature: string,
  apiKey?: string
): Promise<boolean> {
  const key = apiKey || secrets.get("KHETHAIQ_API_KEY");
  if (!key || !signature) return false;
  const expected = await hmacSha256(body, key);
  const expectedB64 = base64UrlEncode(expected);
  return expectedB64 === signature;
}

// ---------------------------------------------------------------------------
// Estate Media Theme Tokens — passed to the embedded KhethaIQ app so it
// visually inherits the Arriv Estate Media color scheme.
// ---------------------------------------------------------------------------

export const ESTATE_MEDIA_THEME = {
  light: {
    "--color-cream": "#FFFBF5",
    "--color-gold": "#B8956A",
    "--color-black": "#1A1A1A",
    "--bg-primary": "#FFFBF5",
    "--bg-secondary": "#FFFFFF",
    "--text-primary": "#1A1A1A",
    "--text-secondary": "rgba(26, 26, 26, 0.6)",
    "--accent-color": "#B8956A",
    "--accent-hover": "#A68559",
    "--border-color": "rgba(184, 149, 106, 0.2)",
    "--card-bg": "#FFFFFF",
  },
  dark: {
    "--color-cream": "#FFFBF5",
    "--color-gold": "#B8956A",
    "--color-black": "#1A1A1A",
    "--bg-primary": "#0A0A0A",
    "--bg-secondary": "#1A1A1A",
    "--text-primary": "#FFFBF5",
    "--text-secondary": "rgba(255, 251, 245, 0.6)",
    "--accent-color": "#B8956A",
    "--accent-hover": "#C9A87B",
    "--border-color": "rgba(184, 149, 106, 0.3)",
    "--card-bg": "#1A1A1A",
  },
};

// ---------------------------------------------------------------------------
// Estate Media Recruiting Context — customizes the central KhethaIQ experience
// for Estate Media's roles, markets, and requirements.
// ---------------------------------------------------------------------------

export const ESTATE_MEDIA_RECRUITING_CONTEXT = {
  calling_application: CALLING_APPLICATION,
  tenant_id: TENANT_ID,
  roles: [
    {
      id: "media_specialist",
      label: "Media Specialist",
      requirements: {
        equipment: [
          "DSLR or mirrorless camera",
          "drone (FAA Part 107 certified)",
          "stabilization gear",
          "lighting kit",
        ],
        skills: [
          "real estate photography",
          "videography",
          "drone photography",
          "interior photography",
          "video editing",
        ],
        certifications: ["FAA Part 107"],
        portfolio_required: true,
        availability: "flexible, on-site at property locations",
      },
    },
    {
      id: "sales_growth_advisor",
      label: "Sales Growth Advisor",
      requirements: {
        skills: [
          "B2B sales",
          "real estate",
          "cold calling",
          "CRM",
          "pipeline management",
        ],
        availability: "full-time, remote + local market travel",
      },
    },
  ],
  markets: ["Atlanta, GA", "Charlotte, NC", "Nashville, TN"],
};

// ---------------------------------------------------------------------------
// Build the full context object to pass to the embedded KhethaIQ app
// ---------------------------------------------------------------------------

export function buildEmbedContext(user: {
  id: string;
  email: string;
  full_name: string;
  role: string;
}) {
  const appDomain = secrets.get("BASE44_APP_DOMAIN") || "";
  const dataEndpoint = appDomain
    ? `${appDomain.replace(/\/$/, "")}/base44/functions/getKhethaIQEmbedData`
    : "/base44/functions/getKhethaIQEmbedData";

  return {
    user: {
      user_id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    },
    ...ESTATE_MEDIA_RECRUITING_CONTEXT,
    data_endpoint: dataEndpoint,
    data_auth_header: "Authorization",
    data_auth_scheme: "Bearer",
  };
}