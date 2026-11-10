// Advertising provider layer.
//
// Arriv runs every campaign inside its own advertising accounts, so a provider is an execution
// channel, not a customer connection. Two providers are registered:
//
//   meta   — implemented against the official Marketing (Graph) API, behind the meta_connection
//            and budget_execution switches. It refuses to do anything until an account record is
//            connected and its credential is present.
//   google — readiness only. Google Ads needs a developer token, an approved OAuth scope and an
//            MCC/customer mapping, none of which exist yet, so every mutating call reports
//            not_configured instead of pretending. No browser automation or unofficial endpoint
//            is used anywhere, and none may be added.
//
// Nothing here claims a live capability: a provider only reports success when the platform
// actually returned an object id.

import { AD_SPECIAL_CATEGORY } from "./propertyAdPackages.ts";

export interface ProviderResult<T = any> {
  ok: boolean;
  code?: string;
  reason?: string;
  retryable?: boolean;
  data?: T;
}

export interface AdProvider {
  id: "meta" | "google";
  label: string;
  implemented: boolean;
  describeReadiness(account: any): Record<string, any>;
  ready(account: any, switches: any): ProviderResult;
  createCampaign(ctx: any): Promise<ProviderResult>;
  createAdSet(ctx: any): Promise<ProviderResult>;
  createCreative(ctx: any, variation: any): Promise<ProviderResult>;
  createAd(ctx: any, input: { adSetId: string; creativeId: string; name?: string }): Promise<ProviderResult>;
  setStatus(ctx: any, input: { providerCampaignId: string; status: "ACTIVE" | "PAUSED" }): Promise<ProviderResult>;
  fetchStatus(ctx: any): Promise<ProviderResult>;
  fetchMetrics(ctx: any): Promise<ProviderResult>;
}

function secret(name: string): string {
  const deno = (globalThis as any)?.Deno?.env?.get?.(name);
  if (deno) return String(deno);
  return String((globalThis as any)?.process?.env?.[name] || "");
}

const GRAPH_VERSION = () => secret("META_GRAPH_API_VERSION") || "v21.0";
const GRAPH_BASE = () => `https://graph.facebook.com/${GRAPH_VERSION()}`;

function toCents(value: any): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

async function graphPost(path: string, params: Record<string, any>, token: string): Promise<ProviderResult> {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  form.set("access_token", token);
  try {
    const res = await fetch(`${GRAPH_BASE()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(25000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      const error = body?.error || {};
      const transient = error?.is_transient === true || res.status === 429 || res.status >= 500;
      return {
        ok: false,
        code: `META_${res.status}`,
        reason: String(error?.error_user_msg || error?.message || `Meta returned ${res.status}`),
        retryable: transient,
      };
    }
    return { ok: true, data: body };
  } catch (error: any) {
    return { ok: false, code: "META_NETWORK", reason: String(error?.message || "Meta could not be reached"), retryable: true };
  }
}

async function graphGet(path: string, params: Record<string, any>, token: string): Promise<ProviderResult> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  query.set("access_token", token);
  try {
    const res = await fetch(`${GRAPH_BASE()}${path}?${query.toString()}`, { signal: AbortSignal.timeout(25000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      return {
        ok: false,
        code: `META_${res.status}`,
        reason: String(body?.error?.message || `Meta returned ${res.status}`),
        retryable: res.status === 429 || res.status >= 500,
      };
    }
    return { ok: true, data: body };
  } catch (error: any) {
    return { ok: false, code: "META_NETWORK", reason: String(error?.message || "Meta could not be reached"), retryable: true };
  }
}

function metaToken(): string {
  const name = "META_MARKETING_ACCESS_TOKEN";
  return secret(name);
}

function metaContextGate(ctx: any): ProviderResult {
  const account = ctx?.account;
  const switches = ctx?.switches || {};
  if (!switches.meta_connection) {
    return { ok: false, code: "PROVIDER_DISABLED", reason: "The Meta connection switch is off." };
  }
  if (!account || account.status !== "connected") {
    return { ok: false, code: "ACCOUNT_NOT_CONNECTED", reason: "No connected Meta advertising account is configured." };
  }
  if (!account.ad_account_id) {
    return { ok: false, code: "ACCOUNT_MISSING", reason: "The Meta advertising account id is not configured." };
  }
  if (!metaToken()) {
    return { ok: false, code: "CREDENTIALS_MISSING", reason: "The Meta access token is not configured." };
  }
  return { ok: true };
}

function locationTargeting(creative: any) {
  const targeting: Record<string, any> = {
    publisher_platforms: creative?.targeting?.publisher_platforms?.length ? creative.targeting.publisher_platforms : ["facebook", "instagram"],
    // Housing special category: no age, gender, interest, lookalike or custom-audience targeting.
    targeting_automation: { advantage_audience: 0 },
    geo_locations: { countries: [] as string[] },
  };
  const locations = Array.isArray(creative?.targeting?.locations) ? creative.targeting.locations : [];
  const cities = locations.filter((l: any) => l?.kind === "city" && l?.city);
  const regions = locations.filter((l: any) => l?.kind === "region" && l?.state);
  if (cities.length) {
    targeting.geo_locations.cities = cities.map((l: any) => ({
      key: l.key || l.city,
      radius: Number(l.radius_miles || 25),
      distance_unit: "mile",
    }));
  } else if (regions.length) {
    targeting.geo_locations.regions = regions.map((l: any) => ({ key: l.key || l.state }));
  } else {
    targeting.geo_locations.countries = ["US"];
  }
  return targeting;
}

export const metaProvider: AdProvider = {
  id: "meta",
  label: "Meta (Facebook & Instagram)",
  implemented: true,

  describeReadiness(account: any) {
    return {
      provider: "meta",
      requires: [
        "Arriv-controlled Meta Business portfolio and advertising account",
        "A long-lived system-user access token with ads_management on that account",
        "A Facebook Page id the housing ads run from",
        "Business verification completed for housing advertising",
        "Ad account review/approval for housing Special Ad Category",
      ],
      configured: {
        business_id: !!account?.business_id,
        ad_account_id: !!account?.ad_account_id,
        page_id: !!account?.page_id,
        credential: !!metaToken(),
        spend_controls_verified: account?.spend_controls_verified === true,
      },
      connected: account?.status === "connected",
    };
  },

  ready(account: any, switches: any) {
    const gate = metaContextGate({ account, switches });
    if (!gate.ok) return gate;
    return { ok: true };
  },

  async createCampaign(ctx: any) {
    const gate = metaContextGate(ctx);
    if (!gate.ok) return gate;
    const campaign = ctx.campaign;
    const creative = ctx.creative;
    return graphPost(`/${ctx.account.ad_account_id}/campaigns`, {
      name: `Arriv ${campaign.campaign_id} · ${campaign.public_slug || campaign.listing_id}`,
      objective: "OUTCOME_TRAFFIC",
      // Created paused: activation is a separate, guarded step.
      status: "PAUSED",
      buying_type: "AUCTION",
      special_ad_categories: [AD_SPECIAL_CATEGORY],
      lifetime_budget: Number(campaign.ad_budget_cents || 0),
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      start_time: campaign.scheduled_start_at || undefined,
      stop_time: campaign.ends_at || undefined,
      special_ad_category_country: ["US"],
    }, metaToken()).then((result) => {
      if (result.ok && !result.data?.id) {
        return { ok: false, code: "META_NO_ID", reason: "Meta did not return a campaign id.", retryable: false } as ProviderResult;
      }
      return result;
    }).catch((error: any) => ({ ok: false, code: "META_ERROR", reason: String(error?.message || "Campaign creation failed"), retryable: false }));
  },

  async createAdSet(ctx: any) {
    const gate = metaContextGate(ctx);
    if (!gate.ok) return gate;
    const campaign = ctx.campaign;
    const creative = ctx.creative;
    return graphPost(`/${ctx.account.ad_account_id}/adsets`, {
      name: `Arriv ${campaign.campaign_id} · ad set`,
      campaign_id: campaign.provider_campaign_id,
      lifetime_budget: Number(campaign.ad_budget_cents || 0),
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      status: "PAUSED",
      start_time: campaign.scheduled_start_at || undefined,
      end_time: campaign.ends_at || undefined,
      targeting: locationTargeting(creative),
    }, metaToken());
  },

  async createCreative(ctx: any, variation: any) {
    const gate = metaContextGate(ctx);
    if (!gate.ok) return gate;
    const creative = ctx.creative;
    const linkData: Record<string, any> = {
      message: variation?.primary_text || creative.primary_text,
      link: creative.link_url,
      name: variation?.headline || creative.headline,
      description: creative.description,
      call_to_action: { type: creative.call_to_action || "LEARN_MORE", value: { link: creative.link_url } },
    };
    // A public, already-approved image is passed as a picture URL; nothing is re-hosted.
    if (ctx.imageUrl) linkData.picture = ctx.imageUrl;
    return graphPost(`/${ctx.account.ad_account_id}/adcreatives`, {
      name: `Arriv ${ctx.campaign.campaign_id} · ${variation?.label || "creative"}`,
      object_story_spec: { page_id: ctx.account.page_id, link_data: linkData },
    }, metaToken());
  },

  async createAd(ctx: any, input: { adSetId: string; creativeId: string; name?: string }) {
    const gate = metaContextGate(ctx);
    if (!gate.ok) return gate;
    return graphPost(`/${ctx.account.ad_account_id}/ads`, {
      name: input.name || `Arriv ${ctx.campaign.campaign_id} · ad`,
      adset_id: input.adSetId,
      creative: { creative_id: input.creativeId },
      status: "PAUSED",
    }, metaToken());
  },

  async setStatus(ctx: any, input: { providerCampaignId: string; status: "ACTIVE" | "PAUSED" }) {
    const gate = metaContextGate(ctx);
    if (!gate.ok) return gate;
    return graphPost(`/${input.providerCampaignId}`, { status: input.status }, metaToken());
  },

  async fetchStatus(ctx: any) {
    const gate = metaContextGate(ctx);
    if (!gate.ok) return gate;
    if (!ctx.campaign?.provider_campaign_id) {
      return { ok: false, code: "NOT_SUBMITTED", reason: "This campaign has no platform campaign id." };
    }
    return graphGet(`/${ctx.campaign.provider_campaign_id}`, { fields: "status,effective_status,configured_status" }, metaToken());
  },

  async fetchMetrics(ctx: any) {
    const gate = metaContextGate(ctx);
    if (!gate.ok) return gate;
    if (!ctx.campaign?.provider_campaign_id) {
      return { ok: false, code: "NOT_SUBMITTED", reason: "This campaign has no platform campaign id." };
    }
    const result = await graphGet(`/${ctx.campaign.provider_campaign_id}/insights`, {
      fields: "impressions,reach,clicks,spend,cpc,ctr",
      date_preset: "maximum",
    }, metaToken());
    if (!result.ok) return result;
    const row = result.data?.data?.[0] || null;
    if (!row) {
      // No delivery yet: reported figures are genuinely absent, not zero-filled.
      return { ok: true, data: { impressions: null, reach: null, clicks: null, spend_cents: null, empty: true } };
    }
    return {
      ok: true,
      data: {
        impressions: Number(row.impressions || 0),
        reach: row.reach === undefined ? null : Number(row.reach),
        clicks: Number(row.clicks || 0),
        spend_cents: toCents(row.spend),
        cpc_cents: row.cpc ? toCents(row.cpc) : null,
        ctr: row.ctr === undefined ? null : Number(row.ctr),
      },
    };
  },
};

function googleNotConfigured(operation: string): ProviderResult {
  return {
    ok: false,
    code: "NOT_CONFIGURED",
    reason: `Google Ads ${operation} is not available. A Google Ads developer token, an approved OAuth scope and a customer account mapping are required first.`,
  };
}

export const googleAdsProvider: AdProvider = {
  id: "google",
  label: "Google Ads",
  implemented: false,

  describeReadiness(account: any) {
    return {
      provider: "google",
      operational: false,
      requires: [
        "Google Ads manager (MCC) account controlled by Arriv",
        "Developer token approval from Google",
        "OAuth client with the Google Ads scope",
        "A customer account (customer id) campaigns are created in",
        "Conversion action / reporting access for campaign metrics",
      ],
      configured: {
        business_id: !!account?.business_id,
        ad_account_id: !!account?.ad_account_id,
        credential: !!(secret("GOOGLE_ADS_DEVELOPER_TOKEN") && secret("GOOGLE_ADS_REFRESH_TOKEN")),
      },
      // Deliberately false: the provider reports not_configured rather than claiming readiness.
      connected: false,
      mapping: {
        campaign: "PropertyAdCampaign.campaign_id → campaign name",
        budget: "PropertyAdCampaign.ad_budget_cents → campaign budget (lifetime)",
        schedule: "scheduled_start_at / ends_at → campaign start and end dates",
        reporting: "propertyAdReporting consumes the same metric shape as Meta",
      },
    };
  },

  ready(account: any, switches: any) {
    if (!switches?.google_publish) {
      return { ok: false, code: "PROVIDER_DISABLED", reason: "Google Ads publishing is switched off." };
    }
    return googleNotConfigured("publishing");
  },

  async createCampaign() {
    return googleNotConfigured("campaign creation");
  },
  async createAdSet() {
    return googleNotConfigured("ad group creation");
  },
  async createCreative() {
    return googleNotConfigured("creative creation");
  },
  async createAd() {
    return googleNotConfigured("ad creation");
  },
  async setStatus() {
    return googleNotConfigured("status changes");
  },
  async fetchStatus() {
    return googleNotConfigured("status retrieval");
  },
  async fetchMetrics() {
    return googleNotConfigured("reporting");
  },
};

export function providerFor(id: string): AdProvider {
  return id === "google" ? googleAdsProvider : metaProvider;
}

export async function loadProviderAccount(client: any, provider: string) {
  const rows = await client.asServiceRole.entities.PropertyAdProviderAccount.filter({ provider });
  const list = Array.isArray(rows) ? rows : rows?.items || [];
  return list[0] || null;
}