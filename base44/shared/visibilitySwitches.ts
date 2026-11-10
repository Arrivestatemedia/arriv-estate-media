// Independent safety switches for the Phase 4 visibility subscriptions and public profiles.
//
// Every switch is fail-closed: OFF unless an administrator has deliberately stored the exact enabled
// value in AppSetting. Deploying code never enables anything, and these keys are separate from the
// Phase 1 publication gate, the Phase 2 package keys and the Phase 3 advertising keys.
//
//   visibility_subscription_checkout  — customers may start a recurring subscription checkout
//   visibility_profile_publication    — an authorized, approved professional profile may publish
//   visibility_geo_publication        — an approved, eligible geographic page may publish/index
//   visibility_customer_notifications — subscription and billing emails may be sent to customers

export const VISIBILITY_SWITCH_KEYS = {
  subscription_checkout: "visibility_subscription_checkout",
  profile_publication: "visibility_profile_publication",
  geo_publication: "visibility_geo_publication",
  customer_notifications: "visibility_customer_notifications",
} as const;

export type VisibilitySwitchName = keyof typeof VISIBILITY_SWITCH_KEYS;

export interface VisibilitySwitches {
  subscription_checkout: boolean;
  profile_publication: boolean;
  geo_publication: boolean;
  customer_notifications: boolean;
}

export const VISIBILITY_SWITCH_OFF: VisibilitySwitches = {
  subscription_checkout: false,
  profile_publication: false,
  geo_publication: false,
  customer_notifications: false,
};

export const VISIBILITY_SWITCH_LABELS: Record<VisibilitySwitchName, string> = {
  subscription_checkout: "Subscription checkout",
  profile_publication: "Agent & brokerage profile publication",
  geo_publication: "Geographic property page publication",
  customer_notifications: "Customer subscription emails",
};

export const VISIBILITY_SWITCH_DESCRIPTIONS: Record<VisibilitySwitchName, string> = {
  subscription_checkout: "Lets customers start a monthly subscription. Off means plans are visible but nothing can be purchased.",
  profile_publication: "Lets an authorized, administrator-approved profile become a public, indexable page.",
  geo_publication: "Lets an approved geographic page that meets the content threshold become public and indexable.",
  customer_notifications: "Sends subscription, renewal, payment-failure and cancellation emails to customers.",
};

function truthy(value: any): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on" || text === "enabled";
}

export async function readVisibilitySwitches(client: any): Promise<VisibilitySwitches> {
  const switches: VisibilitySwitches = { ...VISIBILITY_SWITCH_OFF };
  try {
    const rows = await client.asServiceRole.entities.AppSetting.list("-created_date", 500);
    const list = Array.isArray(rows) ? rows : rows?.items || [];
    const byKey = new Map<string, any>();
    for (const row of list) byKey.set(String(row?.key || ""), row?.value);
    for (const name of Object.keys(VISIBILITY_SWITCH_KEYS) as VisibilitySwitchName[]) {
      switches[name] = truthy(byKey.get(VISIBILITY_SWITCH_KEYS[name]));
    }
  } catch {
    return { ...VISIBILITY_SWITCH_OFF };
  }
  return switches;
}

export function visibilitySwitchSummary(switches: VisibilitySwitches) {
  return (Object.keys(VISIBILITY_SWITCH_KEYS) as VisibilitySwitchName[]).map((name) => ({
    name,
    key: VISIBILITY_SWITCH_KEYS[name],
    label: VISIBILITY_SWITCH_LABELS[name],
    description: VISIBILITY_SWITCH_DESCRIPTIONS[name],
    enabled: switches[name] === true,
  }));
}