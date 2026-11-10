// Independent safety switches for the advertising system.
//
// Every one of these is fail-closed: the switch is OFF unless an administrator has deliberately
// stored the exact enabled value in AppSetting. Nothing here is enabled by deploying code, and
// none of these keys touch the Phase 1 or Phase 2 activation keys.
//
//   property_ads_customer_checkout   — customers may start an advertising checkout
//   property_ads_meta_connection     — Arriv's Meta credentials may be used for API calls
//   property_ads_auto_publish        — a fully approved campaign may be submitted automatically
//   property_ads_google_publish      — Google Ads publishing (not available yet)
//   property_ads_budget_execution    — a campaign may carry a live platform budget
//   property_ads_customer_notifs     — campaign status emails may be sent to customers

export const AD_SWITCH_KEYS = {
  customer_checkout: "property_ads_customer_checkout",
  meta_connection: "property_ads_meta_connection",
  auto_publish: "property_ads_auto_publish",
  google_publish: "property_ads_google_publish",
  budget_execution: "property_ads_budget_execution",
  customer_notifications: "property_ads_customer_notifs",
} as const;

export type AdSwitchName = keyof typeof AD_SWITCH_KEYS;

export interface AdSwitches {
  customer_checkout: boolean;
  meta_connection: boolean;
  auto_publish: boolean;
  google_publish: boolean;
  budget_execution: boolean;
  customer_notifications: boolean;
}

export const AD_SWITCH_OFF: AdSwitches = {
  customer_checkout: false,
  meta_connection: false,
  auto_publish: false,
  google_publish: false,
  budget_execution: false,
  customer_notifications: false,
};

export const AD_SWITCH_LABELS: Record<AdSwitchName, string> = {
  customer_checkout: "Customer advertising checkout",
  meta_connection: "Meta API connection",
  auto_publish: "Automated campaign publishing",
  google_publish: "Google Ads publishing",
  budget_execution: "Campaign budget execution",
  customer_notifications: "Customer campaign notifications",
};

export const AD_SWITCH_DESCRIPTIONS: Record<AdSwitchName, string> = {
  customer_checkout: "Lets customers start an advertising purchase. Off means packages are visible but nothing can be bought.",
  meta_connection: "Allows Arriv's Meta credentials to be used for any API call. Off means no request ever leaves the system.",
  auto_publish: "Allows a fully approved, paid, reviewed campaign to be submitted without an administrator pressing launch.",
  google_publish: "Google Ads publishing. Stays off until Google approvals and an end-to-end verified integration exist.",
  budget_execution: "Allows a submitted campaign to carry a live platform budget. Off blocks every launch by design.",
  customer_notifications: "Sends campaign status emails to the customer.",
};

function truthy(value: any): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on" || text === "enabled";
}

// Reads only the advertising keys; anything unreadable or missing is treated as OFF.
export async function readAdSwitches(client: any): Promise<AdSwitches> {
  const switches: AdSwitches = { ...AD_SWITCH_OFF };
  try {
    const rows = await client.asServiceRole.entities.AppSetting.list("-created_date", 500);
    const list = Array.isArray(rows) ? rows : rows?.items || [];
    const byKey = new Map<string, any>();
    for (const row of list) byKey.set(String(row?.key || ""), row?.value);
    for (const name of Object.keys(AD_SWITCH_KEYS) as AdSwitchName[]) {
      switches[name] = truthy(byKey.get(AD_SWITCH_KEYS[name]));
    }
  } catch {
    return { ...AD_SWITCH_OFF };
  }
  return switches;
}

export function switchSummary(switches: AdSwitches) {
  return (Object.keys(AD_SWITCH_KEYS) as AdSwitchName[]).map((name) => ({
    name,
    key: AD_SWITCH_KEYS[name],
    label: AD_SWITCH_LABELS[name],
    description: AD_SWITCH_DESCRIPTIONS[name],
    enabled: switches[name] === true,
  }));
}